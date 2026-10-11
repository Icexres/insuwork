import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import { supabaseService } from "@/lib/supabase/server";
import { programs } from "@/lib/chain";
import { viewer } from "@/lib/data";

// POST { wallet, name, email? } (admin) after add_panelist confirmed on-chain: stores the display name and, if an
// account with that email exists, grants it the panelist role (roles beyond self-service are server-granted, E-40).
export async function POST(req: Request) {
  const v = await viewer();
  if (v?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(body.wallet);
  } catch {
    return NextResponse.json({ error: "bad wallet" }, { status: 400 });
  }
  const onchain = await programs().disputes.account.panelist.fetchNullable(sdk.pdas.panelist(wallet));
  if (!onchain) return NextResponse.json({ error: "panelist not registered on-chain" }, { status: 400 });
  const db = supabaseService();
  const name = String(body.name ?? "").trim().slice(0, 80);
  const { error } = await db.from("panelists").upsert({ wallet: wallet.toBase58(), name, active: onchain.active });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const email = String(body.email ?? "").trim().toLowerCase();
  if (email) {
    const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
    const user = data?.users.find((u) => u.email?.toLowerCase() === email);
    if (!user) return NextResponse.json({ ok: true, warning: "no account with that email yet" });
    await db.from("profiles").upsert({ id: user.id, role: "panelist" });
    // the panelist then binds this same wallet with SIWS on first visit to /panel
  }
  return NextResponse.json({ ok: true });
}
