import { NextResponse } from "next/server";
import { context, indexerPass, signerDeps } from "@insuwork/indexer";
import { supabaseService } from "@/lib/supabase/server";
import { connection } from "@/lib/chain";
import { cronAuthorized } from "@/lib/cron-auth";

// E-56: one indexer catch-up pass (poll + attestations + MOCK payouts) for serverless hosting, called by a cron.
// Idempotent like the long-running `pnpm indexer`, which still works locally.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conn = connection();
  const db = supabaseService();
  const errors: string[] = [];
  const log = (e: unknown) => errors.push(e instanceof Error ? e.message : String(e));
  const [attest, partner] = await Promise.all([
    signerDeps(conn, db, "ATTESTER_SECRET_KEY"),
    signerDeps(conn, db, "MOCK_PARTNER_SECRET_KEY"),
  ]);
  await indexerPass(context(conn, db), conn, { attest, partner }, log);
  return NextResponse.json({ ok: !errors.length, attester: !!attest, partner: !!partner, errors }, { status: errors.length ? 500 : 200 });
}
