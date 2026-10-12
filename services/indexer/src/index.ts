// T-22 indexer (E-41): live log subscription + signature polling, both feeding one idempotent path.
//   1. every decoded event → events_raw, keyed (sig, top-level ix index, event index)
//   2. every account an event names is re-read from chain and upserted into the mirror tables,
//      so replays and out-of-order delivery converge on current state.
// Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [SOLANA_RPC_URL=…] node services/indexer/src/index.ts
import { pathToFileURL } from "node:url";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, type AccountInfo } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";
// relative (not @insuwork/sdk) so the Linux test container resolves it without a workspace install
import * as sdk from "../../../packages/sdk/src/index.ts";

export type Ctx = {
  p: sdk.Programs;
  db: SupabaseClient;
  getAccount: (key: PublicKey) => Promise<AccountInfo<Buffer> | null>;
};

const hex = (b: number[] | Uint8Array) => Buffer.from(b).toString("hex");
const ts = (n: { toNumber(): number }) => (n.toNumber() ? new Date(n.toNumber() * 1000).toISOString() : null);
const variant = (e: object) => Object.keys(e)[0];
const DEFAULT_KEY = PublicKey.default.toBase58();

/** JSON-safe event data: keys → base58, BN → decimal string, 32-byte arrays → hex. */
export function toJson(v: unknown): unknown {
  if (v instanceof PublicKey) return v.toBase58();
  if (anchor.BN.isBN(v)) return (v as anchor.BN).toString();
  if (Array.isArray(v)) return v.length === 32 && v.every((x) => typeof x === "number") ? hex(v) : v.map(toJson);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]));
  return v;
}

/** Events per top-level instruction: [{ ix_index, event_index, instruction, program, name, data }]. */
export function eventsFromLogs(p: sdk.Programs, logs: string[]) {
  const segments: string[][] = [];
  for (const line of logs) {
    if (/^Program \w+ invoke \[1\]$/.test(line)) segments.push([]);
    segments.at(-1)?.push(line);
  }
  return segments.flatMap((seg, ix_index) => {
    const instruction = seg.find((l) => l.startsWith("Program log: Instruction: "))?.slice(26) ?? null;
    return sdk.decodeEvents(p, seg).map((e, event_index) => ({ ix_index, event_index, instruction, program: e.program, name: e.name, data: toJson(e.data) }));
  });
}

// account discriminators from the IDLs
const KINDS: [account: string, program: keyof sdk.Programs, kind: string][] = [
  ["bondVault", "bond", "vault"], ["backing", "bond", "backing"],
  ["commitment", "escrow", "commitment"], ["milestone", "escrow", "milestone"], ["claim", "disputes", "claim"],
];
const IDLS = { bond: sdk.bondIdl, escrow: sdk.escrowIdl, disputes: sdk.disputesIdl } as const;
function classify(p: sdk.Programs, info: AccountInfo<Buffer>) {
  for (const [account, program, kind] of KINDS) {
    if (!info.owner.equals(p[program].programId)) continue;
    const disc = (IDLS[program].accounts as { name: string; discriminator: number[] }[])
      .find((a) => a.name[0].toLowerCase() + a.name.slice(1) === account)!.discriminator;
    if (info.data.subarray(0, 8).equals(Buffer.from(disc))) return { kind, data: p[program].coder.accounts.decode(account, info.data) };
  }
  return null;
}

const upsert = async (db: SupabaseClient, table: string, row: object) => {
  const { error } = await db.from(table).upsert(row);
  if (error) throw new Error(`${table}: ${error.message}`);
};

/** Re-read one account (and the parents its mirror row references) and upsert it. */
// ponytail: last write wins; every write is fresh chain state, add a slot guard if two indexers ever run.
export async function refresh(ctx: Ctx, key: PublicKey, seen = new Set<string>()): Promise<void> {
  const k = key.toBase58();
  if (seen.has(k) || k === DEFAULT_KEY) return;
  seen.add(k);
  const info = await ctx.getAccount(key);
  if (!info) {
    // closed account: only backings are closed on-chain
    await ctx.db.from("backings").update({ closed: true }).eq("pubkey", k);
    return;
  }
  const acc = classify(ctx.p, info);
  if (!acc) return;
  const d = acc.data;
  switch (acc.kind) {
    case "vault":
      return upsert(ctx.db, "vaults", {
        pubkey: k, voucher: d.voucher.toBase58(), deposited: d.deposited.toString(), allocated: d.allocated.toString(),
        locked: d.locked.toString(), claims_paid: d.claimsPaid.toString(), premiums_earned: d.premiumsEarned.toString(),
      });
    case "backing":
      await refresh(ctx, d.vault, seen);
      await upsert(ctx.db, "backings", {
        pubkey: k, vault: d.vault.toBase58(), freelancer_ref: hex(d.freelancerRef), cap: d.cap.toString(),
        locked: d.locked.toString(), active_commitments: d.activeCommitments, closed: !d.active,
      });
      return markBacked(ctx, hex(d.freelancerRef));
    case "commitment": {
      const backings: PublicKey[] = d.backings.slice(0, d.backingCount);
      for (const b of backings) await refresh(ctx, b, seen);
      const voucherOf = async (b: PublicKey) => {
        const backing = classify(ctx.p, (await ctx.getAccount(b))!)!.data;
        return classify(ctx.p, (await ctx.getAccount(backing.vault))!)!.data.voucher.toBase58() as string;
      };
      const vouchers = await Promise.all(backings.map(voucherOf));
      await upsert(ctx.db, "commitments", {
        pubkey: k, client: d.client.toBase58(), freelancer_ref: hex(d.freelancerRef), partner: d.partner.toBase58(),
        backings: backings.map((b) => b.toBase58()), vouchers, status: variant(d.status), milestone_count: d.milestoneCount,
        total_required: d.totalRequired.toString(), funded: d.funded.toString(), released: d.released.toString(),
        remaining_salary: d.remainingSalary.toString(), freelancer_share_bps: d.freelancerShareBps,
        active_milestone: d.activeMilestone, vest_amount: d.vestAmount.toString(), vest_status: variant(d.vestStatus),
        vest_due_ts: ts(d.vestDueTs),
      });
      for (let i = 0; i < d.milestonesAdded; i++) await refresh(ctx, sdk.pdas.milestone(key, i), seen);
      return;
    }
    case "milestone":
      await refresh(ctx, d.commitment, seen);
      return upsert(ctx.db, "milestones", {
        pubkey: k, commitment: d.commitment.toBase58(), index: d.index, amount: d.amount.toString(), due_ts: ts(d.dueTs),
        spec_hash: hex(d.specHash), status: variant(d.status), release_mode: variant(d.releaseMode),
        released_ts: ts(d.releasedTs), submitted_ts: ts(d.submittedTs), locked_amount: d.lockedAmount.toString(),
      });
    case "claim":
      await refresh(ctx, d.commitment, seen);
      return upsert(ctx.db, "claims", {
        pubkey: k, milestone: d.milestone.toBase58(), commitment: d.commitment.toBase58(), evidence_hash: hex(d.evidenceHash),
        panel: d.panel.map((x: PublicKey) => x.toBase58()).filter((x: string) => x !== DEFAULT_KEY),
        votes: d.votes, status: variant(d.status), outcome: variant(d.outcome), payout: d.payout.toString(),
        filed_ts: ts(d.filedTs), deadline_ts: ts(d.rulingDeadline),
      });
  }
}

/** E-51: an application becomes "backed" once any backing for the freelancer's ref exists (admin set it ready first). */
async function markBacked(ctx: Ctx, ref: string) {
  const { data: kyc } = await ctx.db.from("partner_kyc").select("freelancer_user_id").eq("freelancer_ref", ref).maybeSingle();
  if (kyc) await ctx.db.from("applications").update({ status: "backed" }).eq("freelancer_user_id", kyc.freelancer_user_id).eq("status", "ready");
}

const REFRESH_FIELDS = ["commitment", "vault", "backing", "claim", "milestone"];

/** Idempotent: store a transaction's events and refresh every account they name. */
export async function ingest(ctx: Ctx, sig: string, slot: number, logs: string[]) {
  const events = eventsFromLogs(ctx.p, logs);
  if (!events.length) return 0;
  const { error } = await ctx.db.from("events_raw").upsert(
    events.map((e) => ({ sig, slot, ...e })),
    { onConflict: "sig,ix_index,event_index", ignoreDuplicates: true },
  );
  if (error) throw new Error(`events_raw: ${error.message}`);

  const keys = new Set<string>();
  for (const e of events) {
    const data = e.data as Record<string, unknown>;
    for (const f of REFRESH_FIELDS) if (typeof data[f] === "string") keys.add(data[f] as string);
  }
  const seen = new Set<string>();
  // parents first so mirror foreign keys hold
  for (const k of keys) await refresh(ctx, new PublicKey(k), seen);
  for (const e of events) {
    const d = e.data as { commitment?: string; index?: number };
    if ((e.name === "milestoneReleased" || e.name === "milestoneResolved") && d.commitment !== undefined) {
      await ctx.db.from("milestones").update({ tx_sig: sig })
        .eq("pubkey", sdk.pdas.milestone(new PublicKey(d.commitment), d.index!).toBase58());
    }
  }
  return events.length;
}

/** Catch-up: every program signature newer than the stored cursor, oldest first. */
export async function poll(ctx: Ctx, connection: Connection) {
  for (const id of [sdk.BOND_PROGRAM_ID, sdk.ESCROW_PROGRAM_ID, sdk.DISPUTES_PROGRAM_ID]) {
    const program = id.toBase58();
    const { data: cur } = await ctx.db.from("indexer_cursors").select("last_sig").eq("program", program).maybeSingle();
    const sigs = [];
    for (let before: string | undefined; ;) {
      const page = await connection.getSignaturesForAddress(id, { until: cur?.last_sig, before, limit: 1000 }, "confirmed");
      sigs.push(...page);
      if (page.length < 1000) break;
      before = page.at(-1)!.signature;
    }
    for (const s of sigs.reverse()) {
      if (s.err) continue;
      const tx = await connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (tx?.meta?.logMessages) await ingest(ctx, s.signature, tx.slot, tx.meta.logMessages);
    }
    if (sigs.length) await upsert(ctx.db, "indexer_cursors", { program, last_sig: sigs.at(-1)!.signature, updated_at: new Date().toISOString() });
  }
}

export function context(connection: Connection, db: SupabaseClient): Ctx {
  // read-only: the wallet never signs (no anchor.Wallet: it is missing from anchor's bundled build, which Next uses)
  const readOnly = { publicKey: Keypair.generate().publicKey, signTransaction: () => Promise.reject(new Error("read-only")), signAllTransactions: () => Promise.reject(new Error("read-only")) };
  const p = sdk.programs(new anchor.AnchorProvider(connection, readOnly as never, { commitment: "confirmed" }));
  return { p, db, getAccount: (k) => connection.getAccountInfo(k, "confirmed") };
}

/** SAS signer (E-44): the env key (base58) signs and pays; SAS_CREDENTIAL_AUTHORITY locates the credential. */
export async function signerDeps(connection: Connection, db: SupabaseClient, env: "ATTESTER_SECRET_KEY" | "MOCK_PARTNER_SECRET_KEY") {
  if (!process.env[env] || !process.env.SAS_CREDENTIAL_AUTHORITY) {
    console.error(`[indexer] ${env === "ATTESTER_SECRET_KEY" ? "attester" : "MOCK partner"} off: ${env} / SAS_CREDENTIAL_AUTHORITY not set`);
    return null;
  }
  const { default: bs58 } = await import("bs58");
  const { Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
  const fx = await import("./effects.ts");
  const kp = Keypair.fromSecretKey(bs58.decode(process.env[env]!));
  return {
    db, signer: kp.publicKey, credentialAuthority: new PublicKey(process.env.SAS_CREDENTIAL_AUTHORITY),
    exists: fx.chainExists(connection),
    send: (ix: import("@solana/web3.js").TransactionInstruction) => sendAndConfirmTransaction(connection, new Transaction().add(ix), [kp], { commitment: "confirmed" }),
  };
}

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const ctx = context(connection, db);
  const log = (e: unknown) => console.error("[indexer]", e instanceof Error ? e.message : e);

  for (const id of [sdk.BOND_PROGRAM_ID, sdk.ESCROW_PROGRAM_ID, sdk.DISPUTES_PROGRAM_ID]) {
    connection.onLogs(id, ({ signature, err, logs }, { slot }) => {
      if (!err) ingest(ctx, signature, slot, logs).catch(log);
    }, "confirmed");
  }
  const every = Number(process.env.INDEXER_POLL_SECS ?? 30) * 1000;
  const attest = await signerDeps(connection, db, "ATTESTER_SECRET_KEY");
  const partner = await signerDeps(connection, db, "MOCK_PARTNER_SECRET_KEY");
  for (;;) {
    await indexerPass(ctx, connection, { attest, partner }, log);
    await new Promise((r) => setTimeout(r, every));
  }
}

type Signer = Awaited<ReturnType<typeof signerDeps>>;
/** One catch-up pass: poll every program, then the side effects. Used by the loop above and by
 *  POST /api/indexer/run (serverless hosting, E-56: a cron calls it instead of a long-running worker). */
export async function indexerPass(ctx: Ctx, connection: Connection, s: { attest: Signer; partner: Signer }, log: (e: unknown) => void) {
  await poll(ctx, connection).catch(log);
  const fx = await import("./effects.ts");
  if (s.attest) await fx.attestPendingDeliveries(s.attest).catch(log);
  if (s.partner) await fx.mockPartnerPayouts(s.partner).catch(log);
  await fx.mockVestPayouts({ db: ctx.db }).catch(log);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
