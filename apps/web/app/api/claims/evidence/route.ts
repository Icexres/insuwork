import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import { supabaseService } from "@/lib/supabase/server";
import { programs } from "@/lib/chain";
import { viewer } from "@/lib/data";

// POST { commitment, index, statement } (client) → { evidenceHash } to pass to file_claim.
// ponytail: text statement only; file uploads need Supabase Storage (not started locally yet).
export async function POST(req: Request) {
  const v = await viewer();
  if (!v?.wallet || v.role !== "client") return NextResponse.json({ error: "client wallet required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const statement = String(body?.statement ?? "").trim();
  if (statement.length < 20) return NextResponse.json({ error: "describe what was not delivered (20+ characters)" }, { status: 400 });
  let key: PublicKey;
  try {
    key = new PublicKey(body.commitment);
  } catch {
    return NextResponse.json({ error: "bad commitment" }, { status: 400 });
  }
  const c = await programs().escrow.account.commitment.fetchNullable(key);
  if (!c || c.client.toBase58() !== v.wallet) return NextResponse.json({ error: "not your commitment" }, { status: 403 });

  const milestone = sdk.pdas.milestone(key, Number(body.index)).toBase58();
  const hash = sdk.specHash(statement).toString("hex"); // same sha256(utf8) as specs
  const { error } = await supabaseService().from("claim_evidence").insert({ milestone_pubkey: milestone, statement, evidence_hash: hash, uploaded_by: v.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evidenceHash: hash });
}
