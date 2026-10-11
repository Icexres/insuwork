// Server reads for the panel and admin pages: live chain state for decisions, mirror for lists.
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import { supabaseService } from "@/lib/supabase/server";
import { programs } from "@/lib/chain";
import { freelancerNames, short, walletNames } from "@/lib/data";
import devnet from "../../../deployments/devnet.json";

const variant = (e: object) => Object.keys(e)[0];
const big = (x: { toString(): string }) => BigInt(x.toString());

export type ClaimView = Awaited<ReturnType<typeof claimView>>;

/** One claim, live from chain, with the milestone spec and the client's evidence statement. */
export async function claimView(address: string) {
  let key: PublicKey;
  try {
    key = new PublicKey(address);
  } catch {
    return null;
  }
  const p = programs();
  const c = await p.disputes.account.claim.fetchNullable(key);
  if (!c) return null;
  const [m, commitment] = await Promise.all([p.escrow.account.milestone.fetch(c.milestone), p.escrow.account.commitment.fetch(c.commitment)]);
  const db = supabaseService();
  const [{ data: spec }, { data: evidence }, { data: names }] = await Promise.all([
    db.from("milestone_specs").select("spec_markdown").eq("milestone_pubkey", c.milestone.toBase58()).maybeSingle(),
    db.from("claim_evidence").select("statement, evidence_hash, created_at").eq("milestone_pubkey", c.milestone.toBase58()).order("created_at", { ascending: false }),
    db.from("panelists").select("wallet, name"),
  ]);
  const ref = Buffer.from(commitment.freelancerRef).toString("hex");
  const panel = (c.panel as PublicKey[]).map((w) => w.toBase58()).filter((w) => w !== PublicKey.default.toBase58());
  const [fNames, clientNames] = await Promise.all([freelancerNames([ref]), walletNames([commitment.client.toBase58()])]);
  const evidenceHash = Buffer.from(c.evidenceHash).toString("hex");
  return {
    address, commitment: c.commitment.toBase58(), milestone: c.milestone.toBase58(), index: m.index,
    status: variant(c.status), outcome: variant(c.outcome), filedTs: c.filedTs.toNumber(), deadline: c.rulingDeadline.toNumber(),
    amount: big(m.amount), locked: big(m.lockedAmount), claimFee: big(c.claimFee), payout: big(c.payout),
    client: clientNames.get(commitment.client.toBase58()) ?? short(commitment.client.toBase58()),
    freelancer: fNames.get(ref) ?? short(ref), freelancerRef: ref,
    spec: (spec?.spec_markdown as string | undefined) ?? null,
    evidence: ((evidence ?? []) as { statement: string | null; evidence_hash: string }[]).find((e) => e.evidence_hash === evidenceHash)?.statement ?? null,
    evidenceHash,
    panel: panel.map((w, i) => ({
      wallet: w, name: (names ?? []).find((n) => n.wallet === w)?.name ?? short(w),
      vote: c.votes[i] === 1 ? "upheld" : c.votes[i] === 2 ? "rejected" : null,
    })),
  };
}

/** Claims where `wallet` sits on the panel (mirror), newest first. */
export async function panelClaims(wallet: string) {
  const { data } = await supabaseService().from("claims").select("pubkey").contains("panel", [wallet]).order("filed_ts", { ascending: false });
  return (await Promise.all((data ?? []).map((r) => claimView(r.pubkey)))).filter((x): x is NonNullable<ClaimView> => !!x);
}

export async function allClaims() {
  const { data } = await supabaseService().from("claims").select("pubkey").order("filed_ts", { ascending: false }).limit(50);
  return (await Promise.all((data ?? []).map((r) => claimView(r.pubkey)))).filter((x): x is NonNullable<ClaimView> => !!x);
}

/** AD-1: configs, partners, panelists — live from chain; panelist names from the admin table. */
export async function adminOverview() {
  const p = programs();
  // no getProgramAccounts (the public devnet RPC throttles it hardest): panelists come from the admin table,
  // partners from the deployment record, then one batched fetch each
  const { data: names } = await supabaseService().from("panelists").select("wallet, name");
  const panelistWallets = (names ?? []).map((n) => new PublicKey(n.wallet));
  const partnerWallets = [new PublicKey(devnet.mockPartner.wallet)];
  const [bond, escrow, disputes, partnerAccs, panelistAccs, { data: commitments }] = await Promise.all([
    p.bond.account.bondConfig.fetch(sdk.pdas.bondConfig()),
    p.escrow.account.escrowConfig.fetch(sdk.pdas.escrowConfig()),
    p.disputes.account.disputesConfig.fetch(sdk.pdas.disputesConfig()),
    p.escrow.account.partnerRecord.fetchMultiple(partnerWallets.map((w) => sdk.pdas.partner(w))),
    p.disputes.account.panelist.fetchMultiple(panelistWallets.map((w) => sdk.pdas.panelist(w))),
    supabaseService().from("commitments").select("pubkey, client, freelancer_ref, status, total_required, released").limit(100),
  ]);
  const partners = partnerAccs.flatMap((a) => (a ? [{ account: a }] : []));
  const panelists = panelistAccs.flatMap((a) => (a ? [{ account: a }] : []));
  return {
    admin: bond.admin.toBase58(),
    paused: { bond: bond.paused, escrow: escrow.paused, disputes: disputes.paused },
    escrow: {
      treasury: escrow.treasury.toBase58(), oracle: escrow.githubOracle.toBase58(), submitter: escrow.submitter.toBase58(),
      premiumBps: escrow.premiumBps, feeBps: escrow.platformFeeBps, shareBps: escrow.freelancerShareBps,
      claimWindowDays: escrow.claimWindowSecs.toNumber() / 86400, cancelFeeBps: escrow.cancelFeeBps, withdrawPenaltyBps: escrow.withdrawPenaltyBps,
    },
    bond: { minBond: big(bond.minBond), mint: bond.usdcMint.toBase58() },
    disputes: { treasury: disputes.treasury.toBase58(), claimFee: big(disputes.claimFee), rulingDays: disputes.rulingSecs.toNumber() / 86400 },
    partners: partners.map((x) => ({
      wallet: x.account.wallet.toBase58(), name: Buffer.from(x.account.name).toString("utf8").replace(/\0+$/, ""), isMock: x.account.isMock, active: x.account.active,
    })),
    panelists: panelists.map((x) => ({
      wallet: x.account.wallet.toBase58(), active: x.account.active, assigned: x.account.casesAssigned, voted: x.account.casesVoted,
      name: (names ?? []).find((n) => n.wallet === x.account.wallet.toBase58())?.name ?? short(x.account.wallet.toBase58()),
    })),
    commitments: (commitments ?? []) as { pubkey: string; client: string; freelancer_ref: string; status: string; total_required: string; released: string }[],
  };
}

export async function keeperLog() {
  const db = supabaseService();
  const [{ data: runs }, { data: events }] = await Promise.all([
    db.from("keeper_runs").select("ran_at, trigger, result").order("ran_at", { ascending: false }).limit(20),
    db.from("events_raw").select("sig, slot, program, name, instruction, received_at").order("slot", { ascending: false }).limit(30),
  ]);
  return {
    runs: (runs ?? []) as { ran_at: string; trigger: string; result: { cranked: string[]; vests: string[]; skipped: number; errors: string[] } }[],
    events: (events ?? []) as { sig: string; slot: number; program: string; name: string; instruction: string | null; received_at: string }[],
  };
}
