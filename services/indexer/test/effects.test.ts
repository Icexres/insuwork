// W-05: the same release event seen twice (and a second pass) produces one attestation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as sdk from "../../../packages/sdk/src/index.ts";
import { attestPendingDeliveries } from "../src/effects.ts";

// minimal Supabase query-builder fake: select/eq/in/maybeSingle/upsert(onConflict, ignoreDuplicates)
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(t: string) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      const rows = () => (tables[t] ??= []).filter((r) => filters.every((f) => f(r)));
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (x: unknown) => unknown) => res({ data: rows(), error: null }),
        upsert: async (row: Record<string, unknown>, o: { onConflict: string; ignoreDuplicates?: boolean }) => {
          const cols = o.onConflict.split(",");
          const hit = (tables[t] ??= []).find((r) => cols.every((c) => r[c] === row[c]));
          if (!hit) tables[t].push(row);
          else if (!o.ignoreDuplicates) Object.assign(hit, row);
          return { error: null };
        },
      };
      return q;
    },
  };
}

test("W-05 attester is idempotent; upheld claims are never attested", async () => {
  const commitment = Keypair.generate().publicKey;
  const m0 = sdk.pdas.milestone(commitment, 0).toBase58();
  const m1 = sdk.pdas.milestone(commitment, 1).toBase58();
  const release = { sig: "s1", instruction: "ApproveMilestone", name: "milestoneReleased", received_at: "2026-10-11T00:00:00Z",
    data: { commitment: commitment.toBase58(), index: 0, mode: { clientSig: {} } } };
  const upheld = { sig: "s2", instruction: "Finalize", name: "milestoneResolved", received_at: "2026-10-11T00:00:00Z",
    data: { commitment: commitment.toBase58(), index: 1, outcome: { upheld: {} } } };
  const tables: Record<string, Record<string, unknown>[]> = {
    events_raw: [release, { ...release }, upheld], // duplicate delivery of the same release
    commitments: [{ pubkey: commitment.toBase58(), client: Keypair.generate().publicKey.toBase58(), freelancer_ref: "ab".repeat(32),
      vouchers: [Keypair.generate().publicKey.toBase58()] }],
    milestones: [m0, m1].map((pubkey) => ({ pubkey, amount: "1000000000", released_ts: "2026-10-11T00:00:00Z", spec_hash: "09".repeat(32) })),
    attestations: [],
  };
  const onChain = new Set<string>();
  let sends = 0;
  const deps = {
    db: fakeDb(tables) as never,
    attester: Keypair.generate().publicKey,
    credentialAuthority: Keypair.generate().publicKey,
    exists: async (k: PublicKey) => onChain.has(k.toBase58()),
    send: async () => (sends++, `tx${sends}`),
  };

  assert.equal(await attestPendingDeliveries(deps), 1);
  assert.equal(await attestPendingDeliveries(deps), 0, "second pass writes nothing");
  assert.equal(sends, 1);
  assert.deepEqual(tables.attestations.map((a) => a.milestone_pubkey), [m0]);

  // DB lost the row but the attestation exists on-chain → record it, don't send again
  onChain.add(tables.attestations[0].address as string);
  tables.attestations = [];
  assert.equal(await attestPendingDeliveries(deps), 1);
  assert.equal(sends, 1);
  assert.equal(tables.attestations[0].tx_sig, "already-on-chain");
});
