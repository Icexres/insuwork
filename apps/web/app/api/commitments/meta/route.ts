import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import { supabaseService } from "@/lib/supabase/server";
import { programs } from "@/lib/chain";
import { viewer } from "@/lib/data";

// POST { commitment, specs: [{ index, markdown }], github: [{ index, repo, pr }] } — after the client created the
// commitment on-chain. Only the commitment's client may write, and every value must match its on-chain hash.
export async function POST(req: Request) {
  const v = await viewer();
  if (!v?.wallet || v.role !== "client") return NextResponse.json({ error: "client wallet required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  let key: PublicKey;
  try {
    key = new PublicKey(body?.commitment);
  } catch {
    return NextResponse.json({ error: "bad commitment" }, { status: 400 });
  }
  const p = programs();
  const c = await p.escrow.account.commitment.fetchNullable(key);
  if (!c || c.client.toBase58() !== v.wallet) return NextResponse.json({ error: "not your commitment" }, { status: 403 });

  const specs: { index: number; markdown: string }[] = Array.isArray(body.specs) ? body.specs : [];
  const github: { index: number; repo: string; pr: number }[] = Array.isArray(body.github) ? body.github : [];
  const db = supabaseService();
  for (const s of specs) {
    const pda = sdk.pdas.milestone(key, s.index);
    const m = await p.escrow.account.milestone.fetchNullable(pda);
    const hash = sdk.specHash(String(s.markdown));
    if (!m || !Buffer.from(m.specHash).equals(hash)) return NextResponse.json({ error: `spec ${s.index} hash mismatch` }, { status: 400 });
    const { error } = await db.from("milestone_specs").upsert(
      { milestone_pubkey: pda.toBase58(), spec_markdown: s.markdown, spec_hash: hash.toString("hex"), uploaded_by: v.id },
      { onConflict: "milestone_pubkey" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  for (const g of github) {
    const pda = sdk.pdas.milestone(key, g.index);
    const m = await p.escrow.account.milestone.fetchNullable(pda);
    const repo = String(g.repo).toLowerCase();
    const hash = sdk.githubRefHash(repo, Number(g.pr));
    if (!m || !Buffer.from(m.githubRefHash).equals(hash)) return NextResponse.json({ error: `github ${g.index} hash mismatch` }, { status: 400 });
    const { error } = await db.from("github_links").upsert(
      { milestone_pubkey: pda.toBase58(), repo, pr_number: Number(g.pr), ref_hash: hash.toString("hex") },
      { onConflict: "milestone_pubkey" },
    );
    if (error) return NextResponse.json({ error: error.code === "23505" ? "that PR is already linked to another milestone" : error.message }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
