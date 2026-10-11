// T-23 one-time devnet SAS setup (idempotent): attester key, credential "insuwork", both schemas.
// Credential authority = deployer (admin). Authorized signers: attester (delivery) + MOCK partner (NPR credit) — E-44.
// Run on the host: node scripts/sas-setup.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as attest from "../packages/attest/src/index.ts";

const key = (n) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`keys/${n}.json`, "utf8"))));
const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const deployer = key("deployer");
const partner = key("mock-partner");
if (!existsSync("keys/attester.json")) writeFileSync("keys/attester.json", JSON.stringify([...Keypair.generate().secretKey]));
const attester = key("attester");
const send = (ix, signers) => sendAndConfirmTransaction(connection, new Transaction().add(ix), signers, { commitment: "confirmed" });
const exists = async (k) => (await connection.getAccountInfo(k)) !== null;

// attester pays attestation rent; partner pays NPR attestations
for (const [kp, sol] of [[attester, 0.2], [partner, 0.1]]) {
  if ((await connection.getBalance(kp.publicKey)) < (sol / 2) * LAMPORTS_PER_SOL) {
    console.log(`fund ${kp.publicKey.toBase58()} ${sol} SOL`, await send(SystemProgram.transfer({
      fromPubkey: deployer.publicKey, toPubkey: kp.publicKey, lamports: sol * LAMPORTS_PER_SOL,
    }), [deployer]));
  }
}

const credential = await attest.credentialPda(deployer.publicKey);
if (!(await exists(credential))) {
  console.log("create credential", await send(await attest.createCredentialIx(deployer.publicKey, deployer.publicKey, [attester.publicKey, partner.publicKey]), [deployer]));
}
const schemas = {};
for (const s of ["delivery", "nprCredit"]) {
  schemas[s] = await attest.schemaPda(credential, s);
  if (!(await exists(schemas[s]))) console.log(`create schema ${s}`, await send(await attest.createSchemaIx(deployer.publicKey, deployer.publicKey, s), [deployer]));
}

const f = "deployments/devnet.json";
const out = JSON.parse(readFileSync(f, "utf8"));
out.sas = {
  program: attest.SAS_PROGRAM_ID.toBase58(), credential: credential.toBase58(), credentialAuthority: deployer.publicKey.toBase58(),
  attester: attester.publicKey.toBase58(), partnerSigner: partner.publicKey.toBase58(),
  schemas: { delivery: schemas.delivery.toBase58(), nprCredit: schemas.nprCredit.toBase58() },
};
writeFileSync(f, JSON.stringify(out, null, 2) + "\n");
console.log(out.sas);
