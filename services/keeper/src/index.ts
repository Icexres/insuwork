// T-26 keeper (E-41): one idempotent pass, run by a scheduled job (cron → POST /api/keeper/run, or `pnpm keeper`).
//  - crank_auto_release: submitted, still Active milestone whose window (max(due, submitted) + claim window, E-31) closed
//  - release_vest: vest Vesting and due (automatic unless the partner flagged it, E-11)
// Candidates come from the mirror; every send is gated on live chain state, and the program rejects repeats.
// Disputed milestones are never Active, so they are skipped (W-08).

export type LiveMilestone = { status: string; submissions: number; dueTs: number; submittedTs: number };
export type KeeperDeps = {
  now: number; // unix seconds
  claimWindowSecs: number;
  candidates: () => Promise<{ milestones: { commitment: string; index: number }[]; vests: string[] }>;
  milestone: (commitment: string, index: number) => Promise<LiveMilestone | null>;
  vest: (commitment: string) => Promise<{ status: string; dueTs: number } | null>;
  crank: (commitment: string, index: number) => Promise<string>;
  releaseVest: (commitment: string) => Promise<string>;
};

export const windowEnd = (m: LiveMilestone, claimWindowSecs: number) => Math.max(m.dueTs, m.submittedTs) + claimWindowSecs;

export async function keeperPass(d: KeeperDeps) {
  const out = { cranked: [] as string[], vests: [] as string[], skipped: 0, errors: [] as string[] };
  const { milestones, vests } = await d.candidates();
  for (const { commitment, index } of milestones) {
    const m = await d.milestone(commitment, index);
    if (!m || m.status !== "active" || m.submissions === 0 || d.now < windowEnd(m, d.claimWindowSecs)) {
      out.skipped++;
      continue;
    }
    try {
      out.cranked.push(await d.crank(commitment, index));
    } catch (e) {
      out.errors.push(`${commitment}#${index}: ${(e as Error).message}`);
    }
  }
  for (const commitment of vests) {
    const v = await d.vest(commitment);
    if (!v || v.status !== "vesting" || d.now < v.dueTs) {
      out.skipped++;
      continue;
    }
    try {
      out.vests.push(await d.releaseVest(commitment));
    } catch (e) {
      out.errors.push(`${commitment} vest: ${(e as Error).message}`);
    }
  }
  return out;
}
