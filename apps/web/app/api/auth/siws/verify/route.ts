import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { nonceFresh, siwsMessage, verifySignature } from "@/lib/siws";

// POST { wallet, signature (base58) } → binds the wallet to the signed-in profile.
export async function POST(req: Request) {
  const { wallet, signature } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const db = supabaseService();
  // delete-and-return makes the nonce single use
  const { data: row } = await db.from("siws_nonces").delete().eq("user_id", user.id).select().maybeSingle();
  if (!row) return NextResponse.json({ error: "no nonce" }, { status: 400 });
  const issuedAt = new Date(row.issued_at).toISOString();
  const message = siwsMessage(new URL(req.url).host, wallet, row.nonce, issuedAt);
  if (!nonceFresh(issuedAt) || !verifySignature(wallet, message, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { error } = await db.from("wallet_links").upsert({ user_id: user.id, wallet, verified_sig: signature });
  if (error?.code === "23505") return NextResponse.json({ error: "wallet already bound" }, { status: 409 });
  if (error) return NextResponse.json({ error: "bind failed" }, { status: 500 });
  return NextResponse.json({ wallet });
}
