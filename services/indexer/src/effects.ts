// T-23 side effect: one Paid Delivery Record per successful release (SPEC-attestation §5, W-05).
// Successful = MilestoneReleased, or MilestoneResolved with outcome Rejected (claim rejected → paid).
// Upheld/partial claims produce no freelancer attestation (rule 7).
import { PublicKey, type Connection, type TransactionInstruction } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as sdk from "../../../packages/sdk/src/index.ts";
import * as attest from "../../../packages/attest/src/index.ts";

export type AttestDeps = {
  db: SupabaseClient;
  attester: PublicKey; // authorized signer + payer
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
    if (e.name === "milestoneResolved" && !(ev.outcome && "rejected" in ev.outcome)) continue;
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
      payer: d.attester, signer: d.attester, credentialAuthority: d.credentialAuthority, schema: "delivery", milestone,
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

export const chainExists = (connection: Connection) => async (k: PublicKey) => (await connection.getAccountInfo(k)) !== null;
