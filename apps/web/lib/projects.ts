// E-59 client projects: private briefs (RLS: own rows only) and the matcher's candidate pool.
import type { Brief, Match, PlannedMilestone } from "@insuwork/triage";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { backedFreelancers } from "@/lib/data";

const USDC = 1_000_000n;

export type Project = {
  id: string; title: string; brief: string; skills: string[]; budget: string | null; deadline: string | null;
  plan: PlannedMilestone[]; shortlist: { at: string; candidates: Match[] } | null; commitment: string | null; created_at: string;
};

export async function myProjects() {
  const { data } = await supabaseServer().from("projects").select("*").order("created_at", { ascending: false });
  return (data ?? []) as Project[];
}

export async function myProject(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabaseServer().from("projects").select("*").eq("id", id).maybeSingle();
  return data as Project | null;
}

export const projectStatus = (p: Project) =>
  p.commitment ? "committed" : p.shortlist?.candidates.length ? "shortlisted" : p.plan.length ? "planned" : "brief";

export const briefOf = (p: Project): Brief => ({
  title: p.title, brief: p.brief, skills: p.skills, deadline: p.deadline,
  budgetUsd: p.budget ? Number(BigInt(p.budget) / USDC) : null,
});

/**
 * Backed freelancers with free cover, as the matcher sees them. Owner, 2026-10-14 (E-59): the matcher may read the
 * full advisory triage report; the client sees only the matcher's reasons.
 */
// ponytail: whole pool in one prompt, capped at 30; prefilter by skill overlap if the pool outgrows that.
export async function candidatePool() {
  const list = (await backedFreelancers())
    .map((f) => ({ ...f, free: f.backings.reduce((a, b) => a + (b.cap > b.locked ? b.cap - b.locked : 0n), 0n) }))
    .filter((f) => f.free > 0n)
    .slice(0, 30);
  if (!list.length) return [];
  const db = supabaseService();
  const { data: kyc } = await db.from("partner_kyc").select("freelancer_ref, freelancer_user_id").in("freelancer_ref", list.map((f) => f.ref));
  const userOf = new Map((kyc ?? []).map((k) => [k.freelancer_ref, k.freelancer_user_id as string]));
  const { data: apps } = await db.from("applications")
    .select("id, freelancer_user_id, college, grad_year, skills, portfolio_urls, github_handle, intro")
    .in("freelancer_user_id", [...userOf.values()]);
  const { data: reports } = apps?.length
    ? await db.from("triage_reports").select("application_id, summary, report").in("application_id", apps.map((a) => a.id))
    : { data: [] };
  return list.map((f) => {
    const app = (apps ?? []).find((a) => a.freelancer_user_id === userOf.get(f.ref));
    const rep = (reports ?? []).find((r) => r.application_id === app?.id)?.report as Record<string, unknown> | undefined;
    const { version: _v, disclaimer: _d, ...report } = rep ?? {};
    return {
      id: f.ref,
      skills: app?.skills ?? [], education: [app?.college, app?.grad_year].filter(Boolean).join(" "),
      intro: app?.intro ?? null, github: app?.github_handle ?? null, portfolio: app?.portfolio_urls ?? [],
      free_cover_usd: Number(f.free / USDC), backers: f.backings.map((b) => b.voucherName), paid_deliveries: f.paidDeliveries,
      interview_report: rep ? report : null,
    };
  });
}
