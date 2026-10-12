// T-23 side effect: one Paid Delivery Record per successful release (SPEC-attestation §5, W-05).
// Successful = MilestoneReleased, or MilestoneResolved with outcome Rejected (claim rejected → paid).
// Upheld claims produce no freelancer attestation (rule 7); partial ones do (owner, 2026-10-11).
import { PublicKey, type Connection, type TransactionInstruction } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as sdk from "../../../packages/sdk/src/index.ts";
import * as attest from "../../../packages/attest/src/index.ts";
import { MOCK_NPR_PAISA_PER_USDC, mockNprPaisa } from "../../../packages/shared/src/mock-partner.ts";

export type AttestDeps = {
  db: SupabaseClient;
  signer: PublicKey; // authorized SAS signer + payer (attester key, or MOCK partner key for NPR credit)
  credentialAuthority: PublicKey;
  exists: (k: PublicKey) => Promise<boolean>;
  send: (ix: TransactionInstruction) => Promise<string>;
};

const SCHEMA_ID = "insuwork.paid_delivery.v1";
const secs = (iso: string | null | undefined) => BigInt(Math.floor(Date.parse(iso!) / 1000));

/** Idempotent: safe to call on every poll; skips anything already recorded or already on-chain. */
// ponytail: scans all release events each pass; add a processed flag when events_raw gets large.
export async function attestPendingDeliveries(d: AttestDeps) {
  const { data: events, error } = await d.db.from("events_raw")
    .select("sig, instruction, name, data, received_at").in("name", ["milestoneReleased", "milestoneResolved"]);
  if (error) throw new Error(error.message);
  const { data: done } = await d.db.from("attestations").select("milestone_pubkey").eq("kind", "delivery");
  const recorded = new Set((done ?? []).map((r) => r.milestone_pubkey));
  let written = 0;

  for (const e of events ?? []) {
    const ev = e.data as { commitment: string; index: number; mode?: object; outcome?: object };
    // owner 2026-10-11: partial outcomes also get a delivery record (unreachable while votes are binary, OQ-3)
    if (e.name === "milestoneResolved" && !(ev.outcome && ("rejected" in ev.outcome || "partial" in ev.outcome))) continue;
    const commitment = new PublicKey(ev.commitment);
    const milestone = sdk.pdas.milestone(commitment, ev.index);
    if (recorded.has(milestone.toBase58())) continue;

    const [{ data: c }, { data: m }] = await Promise.all([
      d.db.from("commitments").select("client, freelancer_ref, vouchers").eq("pubkey", ev.commitment).maybeSingle(),
      d.db.from("milestones").select("amount, released_ts, spec_hash").eq("pubkey", milestone.toBase58()).maybeSingle(),
    ]);
    if (!c || !m) continue; // mirror not there yet; next pass
    const { data: kyc } = await d.db.from("partner_kyc").select("freelancer_user_id").eq("freelancer_ref", c.freelancer_ref).maybeSingle();
    const { data: prof } = kyc
      ? await d.db.from("profiles").select("share_exact_amount").eq("id", kyc.freelancer_user_id).maybeSingle()
      : { data: null };

    const { ix, attestation } = await attest.createAttestationIx({
      payer: d.signer, signer: d.signer, credentialAuthority: d.credentialAuthority, schema: "delivery", milestone,
      data: attest.deliveryData({
        freelancerRef: Buffer.from(c.freelancer_ref, "hex"), client: new PublicKey(c.client), amount: BigInt(m.amount),
        shareExact: !!prof?.share_exact_amount, date: secs(m.released_ts ?? e.received_at), specHash: Buffer.from(m.spec_hash, "hex"),
        vouchers: (c.vouchers as string[]).map((v) => new PublicKey(v)), commitment, milestoneIndex: ev.index,
        releaseMode: attest.releaseModeCode(e.instruction ?? "", ev.mode && Object.keys(ev.mode)[0]),
      }),
    });
    const tx_sig = (await d.exists(attestation)) ? "already-on-chain" : await d.send(ix);
    const { error: insErr } = await d.db.from("attestations").upsert(
      { milestone_pubkey: milestone.toBase58(), schema: SCHEMA_ID, kind: "delivery", address: attestation.toBase58(), tx_sig },
      { onConflict: "milestone_pubkey,kind", ignoreDuplicates: true },
    );
    if (insErr) throw new Error(insErr.message);
    recorded.add(milestone.toBase58());
    written++;
  }
  return written;
}

/**
 * T-24 MOCK partner (rule 10): for every MilestoneReleased, record a MOCK NPR payout (payouts.is_mock)
 * and an NPR-credit attestation signed by the partner key (E-44). Idempotent per milestone.
 */
export async function mockPartnerPayouts(d: AttestDeps) {
  const { data: events, error } = await d.db.from("events_raw").select("data").eq("name", "milestoneReleased");
  if (error) throw new Error(error.message);
  const { data: done } = await d.db.from("attestations").select("milestone_pubkey").eq("kind", "npr_credit");
  const attested = new Set((done ?? []).map((r) => r.milestone_pubkey));
  let n = 0;
  for (const e of events ?? []) {
    const ev = e.data as { commitment: string; index: number; partnerPayout: string }; // anchor decodes event fields camelCase
    const commitment = new PublicKey(ev.commitment);
    const milestone = sdk.pdas.milestone(commitment, ev.index).toBase58();
    if (attested.has(milestone)) continue;
    const { data: m } = await d.db.from("milestones").select("pubkey").eq("pubkey", milestone).maybeSingle();
    if (!m) continue; // mirror not there yet

    const usdc = BigInt(ev.partnerPayout);
    await d.db.from("payouts").upsert({
      milestone_pubkey: milestone, usdc_amount: usdc.toString(), fx_rate: (Number(MOCK_NPR_PAISA_PER_USDC) / 100).toFixed(4),
      npr_amount: mockNprPaisa(usdc).toString(), credited_at: new Date().toISOString(), is_mock: true,
    }, { onConflict: "milestone_pubkey", ignoreDuplicates: true });
    const { data: payout } = await d.db.from("payouts").select("credited_at").eq("milestone_pubkey", milestone).maybeSingle();

    const { ix, attestation } = await attest.createAttestationIx({
      payer: d.signer, signer: d.signer, credentialAuthority: d.credentialAuthority, schema: "nprCredit", milestone: new PublicKey(milestone),
      data: attest.nprCreditData({ commitment, milestoneIndex: ev.index, creditedDate: secs(payout!.credited_at) }),
    });
    const tx_sig = (await d.exists(attestation)) ? "already-on-chain" : await d.send(ix);
    const { error: insErr } = await d.db.from("attestations").upsert(
      { milestone_pubkey: milestone, schema: "insuwork.npr_credit.v1", kind: "npr_credit", address: attestation.toBase58(), tx_sig },
      { onConflict: "milestone_pubkey,kind", ignoreDuplicates: true },
    );
    if (insErr) throw new Error(insErr.message);
    attested.add(milestone);
    n++;
  }
  return n;
}

/** Owner 2026-10-11: each VestReleased → one MOCK payout row of kind 'retention_vest' (no milestone, no attestation). */
export async function mockVestPayouts(d: Pick<AttestDeps, "db">) {
  const { data: events, error } = await d.db.from("events_raw").select("data").eq("name", "vestReleased");
  if (error) throw new Error(error.message);
  let n = 0;
  for (const e of events ?? []) {
    const ev = e.data as { commitment: string; amount: string };
    const { data: c } = await d.db.from("commitments").select("pubkey").eq("pubkey", ev.commitment).maybeSingle();
    if (!c) continue;
    const { data: existing } = await d.db.from("payouts").select("id").eq("commitment", ev.commitment).eq("kind", "retention_vest").maybeSingle();
    if (existing) continue;
    const usdc = BigInt(ev.amount);
    const { error: insErr } = await d.db.from("payouts").insert({
      kind: "retention_vest", commitment: ev.commitment, milestone_pubkey: null, usdc_amount: usdc.toString(),
      fx_rate: (Number(MOCK_NPR_PAISA_PER_USDC) / 100).toFixed(4), npr_amount: mockNprPaisa(usdc).toString(),
      credited_at: new Date().toISOString(), is_mock: true,
    });
    if (insErr && insErr.code !== "23505") throw new Error(insErr.message); // 23505: raced another pass
    n++;
  }
  return n;
}

export const chainExists = (connection: Connection) => async (k: PublicKey) => (await connection.getAccountInfo(k)) !== null;
