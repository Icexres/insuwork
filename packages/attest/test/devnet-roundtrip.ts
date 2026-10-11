// Devnet check that our encoding matches SAS: write a throwaway delivery attestation, decode it with
// sas-lib against the on-chain schema, then close it (rent back). Run from repo root after sas-setup:
//   node packages/attest/test/devnet-roundtrip.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { address, createNoopSigner, createSolanaRpc } from "@solana/kit";
import { deriveEventAuthorityAddress, deserializeAttestationData, fetchAttestation, fetchSchema, getCloseAttestationInstruction } from "sas-lib";
import * as attest from "../src/index.ts";

const key = (n: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`keys/${n}.json`, "utf8"))));
const url = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const connection = new Connection(url, "confirmed");
const rpc = createSolanaRpc(url);
const attester = key("attester");
const authority = key("deployer").publicKey;
const send = (ix: TransactionInstruction) => sendAndConfirmTransaction(connection, new Transaction().add(ix), [attester], { commitment: "confirmed" });

const nonce = Keypair.generate().publicKey; // stands in for a milestone PDA
const vouchers = [Keypair.generate().publicKey, Keypair.generate().publicKey];
const client = Keypair.generate().publicKey;
const { ix, attestation, schema } = await attest.createAttestationIx({
  payer: attester.publicKey, signer: attester.publicKey, credentialAuthority: authority, schema: "delivery", milestone: nonce,
  data: attest.deliveryData({
    freelancerRef: Buffer.alloc(32, 7), client, amount: 1_234_000_000n, shareExact: false, date: 1_760_000_000n,
    specHash: Buffer.alloc(32, 9), vouchers, commitment: nonce, milestoneIndex: 2, releaseMode: 1,
  }),
});
console.log("create", await send(ix));

const onchain = await fetchAttestation(rpc, address(attestation.toBase58()));
const s = await fetchSchema(rpc, address(schema.toBase58()));
const d = deserializeAttestationData<Record<string, unknown>>(s.data, Uint8Array.from(onchain.data.data));
assert.equal(d.amount_band, 5); // 1,234 USDC → 1,000–1,999
assert.equal(BigInt(d.amount as bigint), 0n);
assert.equal(BigInt(d.date as bigint), 1_760_000_000n);
assert.equal(d.milestone_index, 2);
assert.equal(d.release_mode, 1);
assert.deepEqual(Buffer.from(d.client as number[]), client.toBuffer());
assert.equal(Buffer.from(d.vouchers as number[]).length, 64);
assert.equal(onchain.data.signer, attester.publicKey.toBase58());
console.log("decoded OK:", { ...d, client: "…", vouchers: "…", freelancer_ref: "…", spec_hash: "…", commitment: "…" });

const close = getCloseAttestationInstruction({
  payer: createNoopSigner(address(attester.publicKey.toBase58())), authority: createNoopSigner(address(attester.publicKey.toBase58())),
  credential: address((await attest.credentialPda(authority)).toBase58()), attestation: address(attestation.toBase58()),
  eventAuthority: await deriveEventAuthorityAddress(), attestationProgram: address(attest.SAS_PROGRAM_ID.toBase58()),
});
const closeIx = new TransactionInstruction({
  programId: new PublicKey(close.programAddress),
  keys: close.accounts.map((m) => ({ pubkey: new PublicKey(m.address), isWritable: (m.role & 1) === 1, isSigner: m.role >= 2 })),
  data: Buffer.from(close.data),
});
console.log("close", await send(closeIx));
