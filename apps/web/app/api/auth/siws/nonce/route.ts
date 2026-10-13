import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { WALLET_ROLES, type DbRole } from "@/lib/roles";
import { siwsMessage } from "@/lib/siws";

// POST { wallet } → { message } to sign. One live nonce per user.
export async function POST(req: Request) {
  const { wallet } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string") return NextResponse.json({ error: "wallet required" }, { status: 400 });
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  // rule 1: freelancers never bind a wallet
  if (!profile || !WALLET_ROLES.includes(profile.role as DbRole)) {
    return NextResponse.json({ error: "role has no wallet" }, { status: 403 });
  }

  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const { error } = await supabaseService().from("siws_nonces").upsert({ user_id: user.id, nonce, issued_at: issuedAt });
  if (error) return NextResponse.json({ error: "nonce failed" }, { status: 500 });
  return NextResponse.json({ message: siwsMessage(new URL(req.url).host, wallet, nonce, issuedAt) });
}
