import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import { supabaseService } from "@/lib/supabase/server";
import { connection, keypairFromEnv, programs, send, variant } from "@/lib/chain";
import { handleGithubWebhook } from "@/lib/github-webhook";

// T-25: GitHub `pull_request` webhook → oracle_approve for the linked milestone (W-04).
export async function POST(req: Request) {
  const raw = await req.text();
  const conn = connection();
  const p = programs(conn);
  const res = await handleGithubWebhook(raw, req.headers, {
    secret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    findMilestone: async (repo, pr) => {
      const { data } = await supabaseService().from("github_links").select("milestone_pubkey").eq("repo", repo).eq("pr_number", pr).maybeSingle();
      return data?.milestone_pubkey ?? null;
    },
    milestoneState: async (m) => {
      const ms = await p.escrow.account.milestone.fetchNullable(new PublicKey(m));
      return ms && { status: variant(ms.status), releaseMode: variant(ms.releaseMode) };
    },
    approve: async (m, repo, pr) => {
      const oracle = keypairFromEnv("GITHUB_ORACLE_SECRET_KEY");
      const ms = await p.escrow.account.milestone.fetch(new PublicKey(m));
      const c = await sdk.loadCommitment(p, ms.commitment);
      return send(conn, oracle, [await sdk.oracleApproveIx(p, c, ms.index, oracle.publicKey, sdk.githubRefHash(repo, pr))]);
    },
  }).catch((e: Error) => ({ status: 500, body: { error: e.message } }));
  return NextResponse.json(res.body, { status: res.status });
}
