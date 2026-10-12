// T-23: SAS Paid Delivery Record + MOCK NPR-credit record (docs/SPEC-attestation.md, E-44).
// SAS has no fixed-array/pubkey layout type, so 32-byte values are Vec<u8> (layout 13).
import { PublicKey, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { address, createNoopSigner, type Address } from "@solana/kit";
import {
  SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
  deriveAttestationPda,
  deriveCredentialPda,
  deriveSchemaPda,
  getCreateAttestationInstruction,
  getCreateCredentialInstruction,
  getCreateSchemaInstruction,
} from "sas-lib";

export const SAS_PROGRAM_ID = new PublicKey(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS);
export const CREDENTIAL_NAME = "insuwork";

const U8 = 0, U64 = 3, I64 = 8, BOOL = 10, BYTES = 13;
type Field = [name: string, layout: number];

export const SCHEMAS = {
  delivery: {
    name: "insuwork.paid_delivery", version: 1,
    description: "InsuWork Paid Delivery Record v1",
    fields: [
      ["freelancer_ref", BYTES], ["client", BYTES],
      ["amount_band", U8], ["amount", U64], // band 255 = exact amount shown; amount 0 = banded (freelancer's choice)
      ["date", I64], ["spec_hash", BYTES],
      ["vouchers", BYTES], // 32 bytes per voucher, up to 4
      ["commitment", BYTES], ["milestone_index", U8], ["release_mode", U8],
    ] as Field[],
  },
  nprCredit: {
    name: "insuwork.npr_credit", version: 1,
    description: "InsuWork NPR credit confirmation v1 (signed by the partner)",
    fields: [["commitment", BYTES], ["milestone_index", U8], ["credited_date", I64], ["is_mock", BOOL]] as Field[],
  },
} as const;
export type SchemaKey = keyof typeof SCHEMAS;

// OQ-26 (owner, 2026-10-11): 8 bands, gaps growing with size. Upper edges in whole USDC.
const BAND_EDGES = [50, 100, 250, 500, 1_000, 2_000, 5_000];
export const EXACT = 255;
export const amountBand = (baseUnits: bigint) => {
  const i = BAND_EDGES.findIndex((edge) => baseUnits < BigInt(edge) * 1_000_000n);
  return i === -1 ? BAND_EDGES.length : i;
};

/** SPEC §3 release_mode: 0 client, 1 oracle, 2 auto, 3 claim rejected. */
export const releaseModeCode = (instruction: string, mode?: string) =>
  instruction === "CrankAutoRelease" ? 2 : instruction === "Finalize" ? 3 : mode === "githubOracle" ? 1 : 0;

// ── borsh for the field types above ─────────────────────────────────
function encode(fields: readonly Field[], data: Record<string, unknown>): Uint8Array {
  const parts: Buffer[] = [];
  for (const [name, layout] of fields) {
    const v = data[name];
    if (v === undefined) throw new Error(`missing ${name}`);
    if (layout === U8) parts.push(Buffer.from([Number(v)]));
    else if (layout === BOOL) parts.push(Buffer.from([v ? 1 : 0]));
    else if (layout === U64 || layout === I64) {
      const b = Buffer.alloc(8);
      layout === U64 ? b.writeBigUInt64LE(BigInt(v as bigint)) : b.writeBigInt64LE(BigInt(v as bigint));
      parts.push(b);
    } else {
      const bytes = Buffer.from(v as Uint8Array);
      const len = Buffer.alloc(4);
      len.writeUInt32LE(bytes.length);
      parts.push(len, bytes);
    }
  }
  return Buffer.concat(parts);
}

export type Delivery = {
  freelancerRef: Uint8Array; client: PublicKey; amount: bigint; shareExact: boolean; date: bigint;
  specHash: Uint8Array; vouchers: PublicKey[]; commitment: PublicKey; milestoneIndex: number; releaseMode: number;
};
export const deliveryData = (d: Delivery) => encode(SCHEMAS.delivery.fields, {
  freelancer_ref: d.freelancerRef, client: d.client.toBuffer(),
  amount_band: d.shareExact ? EXACT : amountBand(d.amount), amount: d.shareExact ? d.amount : 0n,
  date: d.date, spec_hash: d.specHash, vouchers: Buffer.concat(d.vouchers.map((v) => v.toBuffer())),
  commitment: d.commitment.toBuffer(), milestone_index: d.milestoneIndex, release_mode: d.releaseMode,
});
export const nprCreditData = (d: { commitment: PublicKey; milestoneIndex: number; creditedDate: bigint }) =>
  encode(SCHEMAS.nprCredit.fields, { commitment: d.commitment.toBuffer(), milestone_index: d.milestoneIndex, credited_date: d.creditedDate, is_mock: true });

// ── addresses + instructions (sas-lib builds @solana/kit ixs; we convert to web3.js v1) ──
const a = (k: PublicKey) => address(k.toBase58());
const pk = (x: Address) => new PublicKey(x);
function toWeb3(ix: { programAddress: Address; accounts?: readonly { address: Address; role: number }[]; data?: object }) {
  const keys: AccountMeta[] = (ix.accounts ?? []).map((m) => ({ pubkey: pk(m.address), isWritable: (m.role & 1) === 1, isSigner: m.role >= 2 }));
  return new TransactionInstruction({ programId: pk(ix.programAddress), keys, data: Buffer.from((ix.data ?? []) as Uint8Array) });
}

export const credentialPda = async (authority: PublicKey) => pk((await deriveCredentialPda({ authority: a(authority), name: CREDENTIAL_NAME }))[0]);
export const schemaPda = async (credential: PublicKey, s: SchemaKey) =>
  pk((await deriveSchemaPda({ credential: a(credential), name: SCHEMAS[s].name, version: SCHEMAS[s].version }))[0]);
/** Nonce = milestone PDA: one attestation per (schema, commitment, milestone) — the idempotency key. */
export const attestationPda = async (credential: PublicKey, schema: PublicKey, milestone: PublicKey) =>
  pk((await deriveAttestationPda({ credential: a(credential), schema: a(schema), nonce: a(milestone) }))[0]);

export async function createCredentialIx(payer: PublicKey, authority: PublicKey, signers: PublicKey[]) {
  return toWeb3(getCreateCredentialInstruction({
    payer: createNoopSigner(a(payer)), authority: createNoopSigner(a(authority)), credential: a(await credentialPda(authority)),
    name: CREDENTIAL_NAME, signers: signers.map(a),
  }));
}

export async function createSchemaIx(payer: PublicKey, authority: PublicKey, s: SchemaKey) {
  const credential = await credentialPda(authority);
  return toWeb3(getCreateSchemaInstruction({
    payer: createNoopSigner(a(payer)), authority: createNoopSigner(a(authority)), credential: a(credential),
    schema: a(await schemaPda(credential, s)), name: SCHEMAS[s].name, description: SCHEMAS[s].description,
    layout: Buffer.from(SCHEMAS[s].fields.map((f) => f[1])), fieldNames: SCHEMAS[s].fields.map((f) => f[0]),
  }));
}

/** `signer` must be an authorized signer of the credential; `credentialAuthority` locates the credential. */
export async function createAttestationIx(o: {
  payer: PublicKey; signer: PublicKey; credentialAuthority: PublicKey; schema: SchemaKey; milestone: PublicKey; data: Uint8Array;
}) {
  const credential = await credentialPda(o.credentialAuthority);
  const schema = await schemaPda(credential, o.schema);
  const attestation = await attestationPda(credential, schema, o.milestone);
  const ix = toWeb3(getCreateAttestationInstruction({
    payer: createNoopSigner(a(o.payer)), authority: createNoopSigner(a(o.signer)), credential: a(credential), schema: a(schema),
    attestation: a(attestation), nonce: a(o.milestone), data: o.data, expiry: 0,
  }));
  return { ix, attestation, schema };
}
