import { NextResponse } from "next/server";
import { keeperPass } from "@insuwork/keeper";
import { chainKeeperDeps } from "@insuwork/keeper/chain";
import { supabaseService } from "@/lib/supabase/server";
import { connection, keypairFromEnv } from "@/lib/chain";
import { cronAuthorized } from "@/lib/cron-auth";

// T-26: one keeper pass for a scheduled job (E-41). Auth: `Authorization: Bearer $KEEPER_RUN_SECRET`.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const deps = await chainKeeperDeps(connection(), supabaseService(), keypairFromEnv("KEEPER_SECRET_KEY"));
    const result = await keeperPass(deps);
    await supabaseService().from("keeper_runs").insert({ trigger: "cron", result });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
