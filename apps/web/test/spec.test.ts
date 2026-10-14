// E-59: milestone validation (order, required context) and the spec text that gets hashed on-chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blankMilestone, milestoneProblem, specMarkdown, type MilestoneDraft } from "../lib/spec.ts";

const NOW = Date.parse("2026-10-14T00:00:00Z");
const ok = (over: Partial<MilestoneDraft> = {}): MilestoneDraft => ({
  ...blankMilestone(), title: "Booking flow", amount: "500", due: "2026-11-01",
  deliverables: "Merged PR + staging URL", acceptance: "Patient can book and cancel", ...over,
});

test("milestoneProblem: complete milestone passes; each missing piece is named", () => {
  assert.equal(milestoneProblem([ok()], 0, NOW), null);
  assert.equal(milestoneProblem([ok({ title: "x" })], 0, NOW), "title");
  assert.equal(milestoneProblem([ok({ amount: "0" })], 0, NOW), "amount");
  assert.equal(milestoneProblem([ok({ amount: "12.5.1" })], 0, NOW), "amount");
  assert.equal(milestoneProblem([ok({ due: "2026-10-01" })], 0, NOW), "due");
  assert.equal(milestoneProblem([ok({ deliverables: "code" })], 0, NOW), "deliverables");
  assert.equal(milestoneProblem([ok({ acceptance: "works" })], 0, NOW), "acceptance");
  assert.equal(milestoneProblem([ok({ mode: "github", repo: "acme", pr: "4" })], 0, NOW), "github");
  assert.equal(milestoneProblem([ok({ mode: "github", repo: "acme/app", pr: "4" })], 0, NOW), null);
});

test("milestoneProblem: a milestone can't be due before the previous one", () => {
  const ms = [ok({ due: "2026-11-10" }), ok({ due: "2026-11-05" })];
  assert.equal(milestoneProblem(ms, 1, NOW), "order");
  assert.equal(milestoneProblem([ms[0], ok({ due: "2026-11-10" })], 1, NOW), null, "same day is fine");
});

test("specMarkdown carries the project context and both checklists, trimmed", () => {
  const md = specMarkdown({ title: " Clinic app ", brief: "Booking for 3 clinics.\n" }, ok(), 1, 3);
  assert.equal(md, "# Clinic app\n\nBooking for 3 clinics.\n\n## Milestone 2 of 3: Booking flow\n\n### Deliverables\n\nMerged PR + staging URL\n\n### Acceptance criteria\n\nPatient can book and cancel");
});
