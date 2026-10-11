// Server-side reads for the role pages: the viewer (Supabase), live chain state (SDK), mirror lists (Supabase).
import { cache } from "react";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { connection, programs } from "@/lib/chain";
import type { DbRole } from "@/lib/roles";

const USDC = 1_000_000n;

/** USDC base units → "1,234.56" (integer math, no floats for money). */
export function usd(base: bigint | string | number | { toString(): string } | null | undefined) {
  const v = BigInt((base ?? 0).toString());
  const neg = v < 0n;
  const a = neg ? -v : v;
  const cents = ((a % USDC) / 10_000n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${(a / USDC).toLocaleString("en-US")}.${cents}`;
}
/** Whole USDC string from user input → base units, or null if invalid. */
export function parseUsd(s: string): bigint | null {
  const m = s.replace(/,/g, "").trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  return m ? BigInt(m[1]) * USDC + BigInt((m[2] ?? "").padEnd(6, "0")) : null;
}
export const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
export const pct = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 100n) / whole));

export type Viewer = { id: string; email: string; role: DbRole; name: string; wallet: string | null };

export const viewer = cache(async (): Promise<Viewer | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: link }] = await Promise.all([
    supabase.from("profiles").select("role, display_name").eq("id", user.id).maybeSingle(),
    supabase.from("wallet_links").select("wallet").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!profile) return null;
  return { id: user.id, email: user.email ?? "", role: profile.role as DbRole, name: profile.display_name ?? user.email ?? "", wallet: link?.wallet ?? null };
});

/** Protocol parameters read from the on-chain configs (never hard-coded). */
// ponytail: 60 s in-process cache — configs change only by admin tx; a hosted multi-instance setup would use a shared cache.
let rulesCache: { at: number; value: Promise<Rules> } | null = null;
type Rules = Awaited<ReturnType<typeof loadRules>>;
export const rules = (): Promise<Rules> => {
  if (!rulesCache || Date.now() - rulesCache.at > 60_000) {
    const value = loadRules();
    rulesCache = { at: Date.now(), value };
    value.catch(() => (rulesCache = null));
  }
  return rulesCache.value;
};
async function loadRules() {
  const p = programs();
  const [bond, escrow, disputes] = await Promise.all([
    p.bond.account.bondConfig.fetch(sdk.pdas.bondConfig()),
    p.escrow.account.escrowConfig.fetch(sdk.pdas.escrowConfig()),
    p.disputes.account.disputesConfig.fetch(sdk.pdas.disputesConfig()),
  ]);
  return {
    mint: bond.usdcMint.toBase58(),
    minBond: BigInt(bond.minBond.toString()),
    premiumBps: escrow.premiumBps,
    feeBps: escrow.platformFeeBps,
    shareBps: escrow.freelancerShareBps,
    claimWindowDays: escrow.claimWindowSecs.toNumber() / 86_400,
    rulingDays: disputes.rulingSecs.toNumber() / 86_400,
    claimFee: BigInt(disputes.claimFee.toString()),
  };
}

export async function usdcBalance(owner: string) {
  const { mint } = await rules();
  try {
    const b = await connection().getTokenAccountBalance(sdk.ata(new PublicKey(owner), new PublicKey(mint)));
    return BigInt(b.value.amount);
  } catch {
    return 0n; // no token account yet
  }
}

/** freelancer_ref → display names (server-only lookup through the MOCK partner link). */
export async function freelancerNames(refs: string[]) {
  if (!refs.length) return new Map<string, string>();
  const db = supabaseService();
  const { data: kyc } = await db.from("partner_kyc").select("freelancer_ref, freelancer_user_id").in("freelancer_ref", refs);
  const ids = (kyc ?? []).map((k) => k.freelancer_user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  return new Map((kyc ?? []).map((k) => [k.freelancer_ref, name.get(k.freelancer_user_id) ?? short(k.freelancer_ref)]));
}

// ── voucher ─────────────────────────────────────────────────────────
export async function voucherVault(wallet: string) {
  const p = programs();
  const vaultKey = sdk.pdas.vault(new PublicKey(wallet));
  const v = await p.bond.account.bondVault.fetchNullable(vaultKey);
  const db = supabaseService();
  const { data: backings } = await db.from("backings").select("*").eq("vault", vaultKey.toBase58()).eq("closed", false);
  const { data: commitments } = await db.from("commitments").select("pubkey, client, freelancer_ref, backings, status, released")
    .contains("vouchers", [wallet]);
  const names = await freelancerNames([...new Set((backings ?? []).map((b) => b.freelancer_ref))]);
  const big = (x: { toString(): string } | undefined) => BigInt((x ?? 0).toString());
  const deposited = big(v?.deposited), allocated = big(v?.allocated), locked = big(v?.locked);
  return {
    exists: !!v,
    address: vaultKey.toBase58(),
    deposited, allocated, locked, unallocated: deposited - allocated,
    premiums: big(v?.premiumsEarned), claimsPaid: big(v?.claimsPaid),
    backings: ((backings ?? []) as { pubkey: string; freelancer_ref: string; cap: string; locked: string; active_commitments: number }[]).map((b) => ({
      ...b,
      name: names.get(b.freelancer_ref) ?? short(b.freelancer_ref),
      commitments: ((commitments ?? []) as { pubkey: string; client: string; status: string; backings: string[] }[])
        .filter((c) => c.backings.includes(b.pubkey)),
    })),
  };
}

/** Ready applicants with their triage summary (vouchers can read ready/backed applications + reports via RLS). */
export async function readyApplicants() {
  const supabase = supabaseServer();
  const { data: apps } = await supabase.from("applications").select("id, freelancer_user_id, college, grad_year, skills, github_handle, status")
    .in("status", ["ready", "backed"]).order("created_at", { ascending: false });
  const ids = (apps ?? []).map((a) => a.id);
  const { data: reports } = ids.length ? await supabase.from("triage_reports").select("application_id, summary, report").in("application_id", ids) : { data: [] };
  const db = supabaseService();
  const userIds = (apps ?? []).map((a) => a.freelancer_user_id);
  const [{ data: profiles }, { data: kyc }] = userIds.length
    ? await Promise.all([
        db.from("profiles").select("id, display_name").in("id", userIds),
        db.from("partner_kyc").select("freelancer_user_id, freelancer_ref").in("freelancer_user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  return (apps ?? []).map((a) => ({
    ...a,
    name: (profiles ?? []).find((p) => p.id === a.freelancer_user_id)?.display_name ?? "—",
    freelancerRef: (kyc ?? []).find((k) => k.freelancer_user_id === a.freelancer_user_id)?.freelancer_ref ?? null,
    report: (reports ?? []).find((r) => r.application_id === a.id) ?? null,
  }));
}

// ── client ──────────────────────────────────────────────────────────
const variant = (e: object) => Object.keys(e)[0];

/** wallet → display name (server-only, via wallet_links → profiles). */
export async function walletNames(wallets: string[]) {
  if (!wallets.length) return new Map<string, string>();
  const db = supabaseService();
  const { data: links } = await db.from("wallet_links").select("wallet, user_id").in("wallet", wallets);
  const ids = (links ?? []).map((l) => l.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  return new Map(wallets.map((w) => {
    const l = (links ?? []).find((x) => x.wallet === w);
    return [w, (l && byId.get(l.user_id)) || short(w)];
  }));
}

export type BackingOption = { vault: string; backing: string; voucher: string; voucherName: string; cap: bigint; locked: bigint };

/** CL-1 browse: every freelancer with at least one open backing, their backers and paid-delivery count. */
export async function backedFreelancers() {
  const db = supabaseService();
  const { data: backings } = await db.from("backings").select("pubkey, vault, freelancer_ref, cap, locked, vaults(voucher)").eq("closed", false);
  const rows = (backings ?? []) as unknown as { pubkey: string; vault: string; freelancer_ref: string; cap: string; locked: string; vaults: { voucher: string } }[];
  const refs = [...new Set(rows.map((b) => b.freelancer_ref))];
  const [names, vouchers, { data: released }] = await Promise.all([
    freelancerNames(refs),
    walletNames([...new Set(rows.map((b) => b.vaults.voucher))]),
    refs.length
      ? db.from("milestones").select("status, commitments!inner(freelancer_ref)").eq("status", "released").in("commitments.freelancer_ref", refs)
      : Promise.resolve({ data: [] }),
  ]);
  const paid = new Map<string, number>();
  for (const m of (released ?? []) as unknown as { commitments: { freelancer_ref: string } }[]) {
    paid.set(m.commitments.freelancer_ref, (paid.get(m.commitments.freelancer_ref) ?? 0) + 1);
  }
  return refs.map((ref) => {
    const options: BackingOption[] = rows.filter((b) => b.freelancer_ref === ref).map((b) => ({
      vault: b.vault, backing: b.pubkey, voucher: b.vaults.voucher, voucherName: vouchers.get(b.vaults.voucher) ?? short(b.vaults.voucher),
      cap: BigInt(b.cap), locked: BigInt(b.locked),
    }));
    return { ref, name: names.get(ref) ?? short(ref), backings: options, totalCap: options.reduce((a, b) => a + b.cap, 0n), paidDeliveries: paid.get(ref) ?? 0 };
  });
}

export async function clientCommitments(wallet: string) {
  const db = supabaseService();
  const { data } = await db.from("commitments").select("pubkey, freelancer_ref, status, milestone_count, total_required, released, remaining_salary")
    .eq("client", wallet);
  const rows = (data ?? []) as { pubkey: string; freelancer_ref: string; status: string; milestone_count: number; total_required: string; released: string; remaining_salary: string }[];
  const names = await freelancerNames([...new Set(rows.map((r) => r.freelancer_ref))]);
  return rows.map((r) => ({ ...r, name: names.get(r.freelancer_ref) ?? short(r.freelancer_ref) }));
}

/** CL-2..CL-5: live commitment + milestones from chain, with off-chain specs, links, claims, payouts. */
export async function commitmentView(address: string) {
  let key: PublicKey;
  try {
    key = new PublicKey(address);
  } catch {
    return null;
  }
  const p = programs();
  const c = await p.escrow.account.commitment.fetchNullable(key);
  if (!c) return null;
  // batched: one RPC for all milestones, one for all claims (public devnet RPC rate-limits)
  const pdas = Array.from({ length: c.milestonesAdded }, (_, i) => sdk.pdas.milestone(key, i));
  const [ms, claims] = await Promise.all([
    p.escrow.account.milestone.fetchMultiple(pdas),
    p.disputes.account.claim.fetchMultiple(pdas.map((m) => sdk.pdas.claim(m))),
  ]);
  const milestones = pdas.map((pda, i) => {
    const m = ms[i]!;
    const claim = claims[i];
    return {
      index: i, pubkey: pda.toBase58(), amount: BigInt(m.amount.toString()), dueTs: m.dueTs.toNumber(), submittedTs: m.submittedTs.toNumber(),
      releasedTs: m.releasedTs.toNumber(), status: variant(m.status), releaseMode: variant(m.releaseMode), lockedAmount: BigInt(m.lockedAmount.toString()),
      claim: claim && { status: variant(claim.status), outcome: variant(claim.outcome), deadline: claim.rulingDeadline.toNumber() },
    };
  });
  const pubkeys = milestones.map((m) => m.pubkey);
  const db = supabaseService();
  const [{ data: specs }, { data: links }, { data: payouts }, { data: atts }] = pubkeys.length
    ? await Promise.all([
        db.from("milestone_specs").select("milestone_pubkey, spec_markdown").in("milestone_pubkey", pubkeys),
        db.from("github_links").select("milestone_pubkey, repo, pr_number").in("milestone_pubkey", pubkeys),
        db.from("payouts").select("milestone_pubkey, kind, usdc_amount, npr_amount, credited_at, commitment").or(`milestone_pubkey.in.(${pubkeys.join(",")}),commitment.eq.${address}`),
        db.from("attestations").select("milestone_pubkey, kind, address").in("milestone_pubkey", pubkeys),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const ref = Buffer.from(c.freelancerRef).toString("hex");
  const backings = c.backings.slice(0, c.backingCount).map((b: PublicKey) => b.toBase58());
  const { data: vaultRows } = backings.length ? await db.from("backings").select("pubkey, vaults(voucher)").in("pubkey", backings) : { data: [] };
  const voucherWallets = ((vaultRows ?? []) as unknown as { vaults: { voucher: string } }[]).map((r) => r.vaults.voucher);
  const [names, vouchers] = await Promise.all([freelancerNames([ref]), walletNames(voucherWallets)]);
  const big = (x: { toString(): string }) => BigInt(x.toString());
  return {
    address, client: c.client.toBase58(), freelancerRef: ref, freelancerName: names.get(ref) ?? short(ref),
    vouchers: voucherWallets.map((w) => vouchers.get(w) ?? short(w)),
    status: variant(c.status), milestoneCount: c.milestoneCount, activeMilestone: c.activeMilestone as number | null,
    totalRequired: big(c.totalRequired), funded: big(c.funded), released: big(c.released), remainingSalary: big(c.remainingSalary),
    vestAmount: big(c.vestAmount), vestStatus: variant(c.vestStatus), vestDueTs: c.vestDueTs.toNumber(),
    premiumBps: c.premiumBps, feeBps: c.platformFeeBps, shareBps: c.freelancerShareBps,
    milestones: milestones.map((m) => ({
      ...m,
      spec: (specs ?? []).find((s) => s.milestone_pubkey === m.pubkey)?.spec_markdown as string | undefined,
      github: (links ?? []).find((l) => l.milestone_pubkey === m.pubkey) as { repo: string; pr_number: number } | undefined,
      payout: (payouts ?? []).find((x) => x.milestone_pubkey === m.pubkey) as { npr_amount: string; credited_at: string } | undefined,
      attestation: (atts ?? []).find((a) => a.milestone_pubkey === m.pubkey && a.kind === "delivery")?.address as string | undefined,
    })),
    vestPayout: (payouts ?? []).find((x) => x.kind === "retention_vest") as { npr_amount: string } | undefined,
  };
}

// ── public profile (wallet-free, successes only — rule 7) ─────────────
export async function publicProfile(ref: string) {
  if (!/^[0-9a-f]{64}$/.test(ref)) return null;
  const db = supabaseService();
  const { data: kyc } = await db.from("partner_kyc").select("freelancer_user_id").eq("freelancer_ref", ref).maybeSingle();
  const [{ data: profile }, { data: app }, { data: backings }, { data: commitments }] = await Promise.all([
    kyc ? db.from("profiles").select("display_name, share_exact_amount").eq("id", kyc.freelancer_user_id).maybeSingle() : Promise.resolve({ data: null }),
    kyc ? db.from("applications").select("college, grad_year, skills").eq("freelancer_user_id", kyc.freelancer_user_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("backings").select("cap, vaults(voucher)").eq("freelancer_ref", ref).eq("closed", false),
    db.from("commitments").select("pubkey, client").eq("freelancer_ref", ref),
  ]);
  const cs = (commitments ?? []) as { pubkey: string; client: string }[];
  const { data: ms } = cs.length
    ? await db.from("milestones").select("pubkey, commitment, index, amount, released_ts, status").in("commitment", cs.map((c) => c.pubkey))
    : { data: [] };
  const milestones = (ms ?? []) as { pubkey: string; commitment: string; index: number; amount: string; released_ts: string | null; status: string }[];
  const { data: atts } = milestones.length ? await db.from("attestations").select("milestone_pubkey, kind, address").in("milestone_pubkey", milestones.map((m) => m.pubkey)) : { data: [] };
  const { data: pays } = milestones.length ? await db.from("payouts").select("milestone_pubkey, credited_at").in("milestone_pubkey", milestones.map((m) => m.pubkey)) : { data: [] };
  const backers = ((backings ?? []) as unknown as { cap: string; vaults: { voucher: string } }[]);
  const names = await walletNames([...new Set([...backers.map((b) => b.vaults.voucher), ...cs.map((c) => c.client)])]);
  // only milestones with a delivery attestation are public records
  const records = milestones.flatMap((m) => {
    const delivery = (atts ?? []).find((a) => a.milestone_pubkey === m.pubkey && a.kind === "delivery");
    if (!delivery) return [];
    const credit = (atts ?? []).find((a) => a.milestone_pubkey === m.pubkey && a.kind === "npr_credit");
    const client = cs.find((c) => c.pubkey === m.commitment)!.client;
    return [{
      released: m.released_ts, amount: BigInt(m.amount), client: names.get(client) ?? short(client), attestation: delivery.address as string,
      nprCredit: credit?.address as string | undefined, creditedAt: (pays ?? []).find((p) => p.milestone_pubkey === m.pubkey)?.credited_at as string | undefined,
    }];
  }).sort((a, b) => String(b.released).localeCompare(String(a.released)));
  return {
    ref, name: (profile?.display_name as string | null) ?? short(ref), shareExact: !!profile?.share_exact_amount,
    sub: app ? [(app.skills as string[]).join(" / "), app.college, app.grad_year].filter(Boolean).join(" · ") : "",
    backers: backers.map((b) => ({ name: names.get(b.vaults.voucher) ?? short(b.vaults.voucher), cap: BigInt(b.cap) })),
    records, clients: new Set(records.map((r) => r.client)).size,
  };
}
