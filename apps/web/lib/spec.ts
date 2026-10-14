// E-59: a milestone spec = the project context + that milestone's deliverables and acceptance criteria.
// Its sha256 goes on-chain at creation (specHash), so this exact text is what the client approves against
// and what a claims panel rules on. Pure: used by the wizard (browser) and tests.

export type MilestoneDraft = {
  title: string; deliverables: string; acceptance: string;
  amount: string; due: string; mode: "client" | "github"; repo: string; pr: string;
};
export type Problem = "amount" | "due" | "order" | "title" | "deliverables" | "acceptance" | "github";

export const blankMilestone = (): MilestoneDraft =>
  ({ title: "", deliverables: "", acceptance: "", amount: "", due: "", mode: "client", repo: "", pr: "" });

const validAmount = (s: string) => /^\d+(\.\d{1,6})?$/.test(s.replace(/,/g, "").trim()) && /[1-9]/.test(s);

/** First problem with milestone `i`, or null. Due dates must be in the future and not before the previous one. */
export function milestoneProblem(ms: MilestoneDraft[], i: number, now = Date.now()): Problem | null {
  const m = ms[i];
  if (m.title.trim().length < 3) return "title";
  if (!validAmount(m.amount)) return "amount";
  if (!m.due || Date.parse(m.due) <= now) return "due";
  if (i > 0 && ms[i - 1].due && m.due < ms[i - 1].due) return "order";
  if (m.deliverables.trim().length < 10) return "deliverables";
  if (m.acceptance.trim().length < 10) return "acceptance";
  if (m.mode === "github" && (!/^[\w.-]+\/[\w.-]+$/.test(m.repo.trim()) || !/^\d+$/.test(m.pr))) return "github";
  return null;
}

export function specMarkdown(project: { title: string; brief: string }, m: MilestoneDraft, i: number, n: number) {
  return [
    `# ${project.title.trim()}`,
    project.brief.trim(),
    `## Milestone ${i + 1} of ${n}: ${m.title.trim()}`,
    "### Deliverables",
    m.deliverables.trim(),
    "### Acceptance criteria",
    m.acceptance.trim(),
  ].join("\n\n");
}
