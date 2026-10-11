// T-25 GitHub oracle webhook (W-04). Pure decision logic; the route wires DB + chain.
import { createHmac, timingSafeEqual } from "node:crypto";

export function validSignature(secret: string, rawBody: string, header: string | null) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export type WebhookDeps = {
  secret: string;
  /** github_links lookup → milestone pubkey for (lowercased repo, PR number) */
  findMilestone: (repo: string, pr: number) => Promise<string | null>;
  /** live on-chain milestone status ("active", "released", …) and mode */
  milestoneState: (milestone: string) => Promise<{ status: string; releaseMode: string } | null>;
  /** send oracle_approve; returns tx signature */
  approve: (milestone: string, repo: string, pr: number) => Promise<string>;
};

type Result = { status: number; body: Record<string, unknown> };

export async function handleGithubWebhook(rawBody: string, headers: Headers, d: WebhookDeps): Promise<Result> {
  if (!validSignature(d.secret, rawBody, headers.get("x-hub-signature-256"))) return { status: 401, body: { error: "bad signature" } };
  if (headers.get("x-github-event") !== "pull_request") return { status: 202, body: { ignored: "event" } };

  let payload: { action?: string; number?: number; pull_request?: { merged?: boolean }; repository?: { full_name?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "bad json" } };
  }
  if (payload.action !== "closed" || payload.pull_request?.merged !== true) return { status: 202, body: { ignored: "not merged" } };
  const repo = payload.repository?.full_name?.toLowerCase();
  const pr = payload.number;
  if (!repo || !Number.isInteger(pr)) return { status: 400, body: { error: "missing repo/pr" } };

  const milestone = await d.findMilestone(repo, pr!);
  if (!milestone) return { status: 202, body: { ignored: "no linked milestone" } };
  // idempotent on redelivery: only an active oracle milestone is approved; the program also rejects repeats
  const state = await d.milestoneState(milestone);
  if (state?.releaseMode !== "githubOracle") return { status: 202, body: { ignored: "not an oracle milestone" } };
  if (state.status !== "active") return { status: 200, body: { milestone, already: state.status } };
  return { status: 200, body: { milestone, tx: await d.approve(milestone, repo, pr!) } };
}
