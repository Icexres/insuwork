// Server-only Solana access for route handlers (webhook oracle, keeper). Keys come from env (rule 11).
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, type TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import * as sdk from "@insuwork/sdk";

/** fetch that waits out the public devnet RPC's 429s and connect timeouts (web3.js gives up quickly). */
const patientFetch: typeof fetch = async (input, init) => {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(input, init);
      if (res.status !== 429 || i >= 6) return res;
    } catch (e) {
      if (i >= 4) throw e; // network error (e.g. ConnectTimeout): retry a few times
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
};

export const connection = () =>
  new Connection(process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com", {
    commitment: "confirmed", fetch: patientFetch, disableRetryOnRateLimit: true,
  });

export const keypairFromEnv = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return Keypair.fromSecretKey(bs58.decode(v));
};

/** Read-mostly program clients; signing happens in `send`. */
const readOnly = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: () => Promise.reject(new Error("read-only provider")),
  signAllTransactions: () => Promise.reject(new Error("read-only provider")),
};
export const programs = (conn = connection()) =>
  sdk.programs(new anchor.AnchorProvider(conn, readOnly as never, { commitment: "confirmed" }));

/** v0 tx with a raised compute limit (multi-backing releases, E-36). */
// ponytail: no lookup table; commitments with 3–4 backings may need one (sdk.commitmentLookupAddresses).
export async function send(conn: Connection, signer: Keypair, ixs: TransactionInstruction[]) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = sdk.buildV0Tx(signer.publicKey, ixs, blockhash, [], sdk.MULTI_BACKING_COMPUTE_UNITS);
  tx.sign([signer]);
  const sig = await conn.sendTransaction(tx);
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

export const variant = (e: object) => Object.keys(e)[0];
