import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { keeperPass } from "@insuwork/keeper";
import { chainKeeperDeps } from "@insuwork/keeper/chain";
import { supabaseService } from "@/lib/supabase/server";
import { connection, keypairFromEnv } from "@/lib/chain";

// T-26: one keeper pass for a scheduled job (E-41). Auth: `Authorization: Bearer $KEEPER_RUN_SECRET`.
export async function POST(req: Request) {
  const secret = process.env.KEEPER_RUN_SECRET ?? "";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const deps = await chainKeeperDeps(connection(), supabaseService(), keypairFromEnv("KEEPER_SECRET_KEY"));
    return NextResponse.json(await keeperPass(deps));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
