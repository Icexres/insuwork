// One keeper pass, for cron / Task Scheduler: `pnpm keeper`
// env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KEEPER_SECRET_KEY (base58), optional SOLANA_RPC_URL
import { Connection, Keypair } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import bs58 from "bs58";
import { keeperPass } from "./index.ts";
import { chainKeeperDeps } from "./chain.ts";

const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const keeper = Keypair.fromSecretKey(bs58.decode(process.env.KEEPER_SECRET_KEY!));
console.log(JSON.stringify(await keeperPass(await chainKeeperDeps(conn, db, keeper))));
