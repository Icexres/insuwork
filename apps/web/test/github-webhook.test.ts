// W-04: bad HMAC rejected; unmerged PR ignored; merged matching PR triggers one oracle_approve (idempotent on redelivery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleGithubWebhook } from "../lib/github-webhook.ts";

const SECRET = "s3cret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const hdrs = (body: string, sig = sign(body), event = "pull_request") =>
  new Headers({ "x-hub-signature-256": sig, "x-github-event": event });
const payload = (merged: boolean, action = "closed") =>
  JSON.stringify({ action, number: 12, pull_request: { merged }, repository: { full_name: "Org/Repo" } });

function world() {
  const state = { status: "active", releaseMode: "githubOracle" };
  const calls: [string, string, number][] = [];
  const deps = {
    secret: SECRET,
    findMilestone: async (repo: string, pr: number) => (repo === "org/repo" && pr === 12 ? "M1" : null),
    milestoneState: async () => ({ ...state }),
    approve: async (m: string, repo: string, pr: number) => {
      calls.push([m, repo, pr]);
      state.status = "released";
      return "tx1";
    },
  };
  return { deps, calls };
}

test("W-04 bad HMAC is rejected", async () => {
  const { deps, calls } = world();
  const body = payload(true);
  assert.equal((await handleGithubWebhook(body, hdrs(body, sign(body, "wrong")), deps)).status, 401);
  assert.equal((await handleGithubWebhook(body, new Headers({ "x-github-event": "pull_request" }), deps)).status, 401);
  assert.equal((await handleGithubWebhook(body + " ", hdrs(body), deps)).status, 401, "body tampered");
  assert.equal(calls.length, 0);
});

test("W-04 unmerged / other events are ignored", async () => {
  const { deps, calls } = world();
  for (const body of [payload(false), payload(true, "opened")]) {
    assert.equal((await handleGithubWebhook(body, hdrs(body), deps)).status, 202);
  }
  const body = payload(true);
  assert.equal((await handleGithubWebhook(body, hdrs(body, sign(body), "push"), deps)).status, 202);
  assert.equal(calls.length, 0);
});

test("W-04 merged matching PR triggers exactly one oracle_approve across redeliveries", async () => {
  const { deps, calls } = world();
  const body = payload(true);
  const first = await handleGithubWebhook(body, hdrs(body), deps);
  assert.deepEqual(first, { status: 200, body: { milestone: "M1", tx: "tx1" } });
  const again = await handleGithubWebhook(body, hdrs(body), deps);
  assert.equal(again.status, 200);
  assert.equal(again.body.already, "released");
  assert.deepEqual(calls, [["M1", "org/repo", 12]]);
});

test("unlinked PR is ignored", async () => {
  const { deps, calls } = world();
  const body = JSON.stringify({ action: "closed", number: 99, pull_request: { merged: true }, repository: { full_name: "Org/Repo" } });
  assert.equal((await handleGithubWebhook(body, hdrs(body), deps)).status, 202);
  assert.equal(calls.length, 0);
});
