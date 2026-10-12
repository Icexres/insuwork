// Scheduled-job routes (keeper, indexer) accept only the exact bearer secret, and nothing when it is unset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cronAuthorized } from "../lib/cron-auth.ts";

const req = (auth?: string) => new Request("http://x/api/indexer/run", { method: "POST", headers: auth ? { authorization: auth } : {} });

test("cron auth", () => {
  delete process.env.KEEPER_RUN_SECRET;
  assert.equal(cronAuthorized(req("Bearer ")), false, "unset secret never authorizes");
  process.env.KEEPER_RUN_SECRET = "s3cret";
  assert.equal(cronAuthorized(req("Bearer s3cret")), true);
  assert.equal(cronAuthorized(req("Bearer s3creT")), false);
  assert.equal(cronAuthorized(req("Bearer s3cret2")), false);
  assert.equal(cronAuthorized(req()), false);
});
