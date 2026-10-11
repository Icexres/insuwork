// W-08: keeper pass is idempotent and skips disputed milestones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { keeperPass, type KeeperDeps, type LiveMilestone } from "../src/index.ts";

const DAY = 86_400;
const NOW = 1_800_000_000;

function chain() {
  const ms: Record<string, LiveMilestone> = {
    "A#0": { status: "active", submissions: 1, dueTs: NOW - 30 * DAY, submittedTs: NOW - 20 * DAY }, // window closed
    "B#0": { status: "disputed", submissions: 1, dueTs: NOW - 30 * DAY, submittedTs: NOW - 20 * DAY }, // claim open
    "C#0": { status: "active", submissions: 1, dueTs: NOW - 30 * DAY, submittedTs: NOW - 2 * DAY }, // resubmitted: window open
    "D#0": { status: "active", submissions: 0, dueTs: NOW - 30 * DAY, submittedTs: 0 }, // never submitted
  };
  const vests: Record<string, { status: string; dueTs: number }> = {
    A: { status: "vesting", dueTs: NOW - DAY }, B: { status: "vesting", dueTs: NOW + DAY }, C: { status: "refunded", dueTs: 0 },
  };
  const sent: string[] = [];
  const deps: KeeperDeps = {
    now: NOW, claimWindowSecs: 14 * DAY,
    candidates: async () => ({
      milestones: Object.keys(ms).map((k) => ({ commitment: k[0], index: 0 })),
      vests: Object.keys(vests),
    }),
    milestone: async (c, i) => ms[`${c}#${i}`] ?? null,
    vest: async (c) => vests[c] ?? null,
    crank: async (c, i) => {
      ms[`${c}#${i}`].status = "released";
      sent.push(`crank ${c}`);
      return `tx-${c}`;
    },
    releaseVest: async (c) => {
      vests[c].status = "released";
      sent.push(`vest ${c}`);
      return `vtx-${c}`;
    },
  };
  return { deps, sent };
}

test("W-08 cranks only closed windows, skips disputed / open / unsubmitted; vests only when due", async () => {
  const { deps, sent } = chain();
  const r = await keeperPass(deps);
  assert.deepEqual(sent, ["crank A", "vest A"]);
  assert.equal(r.skipped, 5);
  assert.deepEqual(r.errors, []);
});

test("W-08 second pass is a no-op", async () => {
  const { deps, sent } = chain();
  await keeperPass(deps);
  const r = await keeperPass(deps);
  assert.deepEqual(sent, ["crank A", "vest A"]);
  assert.equal(r.cranked.length + r.vests.length, 0);
});

test("one failing send does not stop the pass", async () => {
  const { deps } = chain();
  deps.crank = async () => {
    throw new Error("WindowOpen");
  };
  const r = await keeperPass(deps);
  assert.equal(r.errors.length, 1);
  assert.equal(r.vests.length, 1);
});
