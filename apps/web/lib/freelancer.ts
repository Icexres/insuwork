// Server reads for the freelancer pages (no wallet, NPR only — rule 1). Uses the freelancer's own RLS
// session where the policies allow it; the service client only for names the freelancer may see (their backers).
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { short, walletNames, type Viewer } from "@/lib/data";

export type AppRow = {
  id: string; status: string; full_name: string | null; college: string | null; grad_year: number | null; skills: string[];
  portfolio_urls: string[]; github_handle: string | null; intro: string | null; applicant_response: string | null; retakes_used: number;
};

export async function freelancerState(v: Viewer) {
  const supabase = supabaseServer();
  const { data: app } = await supabase.from("applications").select("*").eq("freelancer_user_id", v.id).maybeSingle();
  const a = app as AppRow | null;
  const [{ data: baseline }, { data: kyc }, { data: summary }, { data: sessions }] = await Promise.all([
    supabase.from("application_baselines").select("*").eq("freelancer_user_id", v.id).maybeSingle(),
    supabase.from("my_kyc").select("*").maybeSingle(),
    supabase.from("my_triage_summaries").select("summary, created_at").maybeSingle(),
    a ? supabase.from("triage_sessions").select("id, transcript, ended_at, flagged, started_at").eq("application_id", a.id).order("started_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const session = (sessions ?? [])[0] as { id: string; transcript: { role: string; content: string }[]; ended_at: string | null; flagged: boolean } | undefined;
  return { app: a, baseline, kyc: kyc as { freelancer_ref: string; bank_name: string; account_masked: string } | null, summary, session, sessionCount: (sessions ?? []).length };
}

/** Contracts (commitments mirror, RLS: freelancer_ref = mine) with NPR-only payouts. */
export async function freelancerContracts() {
  const supabase = supabaseServer();
  const { data: cs } = await supabase.from("commitments").select("pubkey, client, status, milestone_count, vouchers, vest_amount, vest_status");
  const commitments = (cs ?? []) as { pubkey: string; client: string; status: string; milestone_count: number; vouchers: string[]; vest_amount: string; vest_status: string }[];
  if (!commitments.length) return { commitments: [], backers: [] as string[] };
  const keys = commitments.map((c) => c.pubkey);
  const [{ data: ms }, { data: pays }] = await Promise.all([
    supabase.from("milestones").select("pubkey, commitment, index, amount, due_ts, status, released_ts").in("commitment", keys).order("index"),
    supabase.from("payouts").select("milestone_pubkey, kind, commitment, npr_amount, credited_at, is_mock"),
  ]);
  const vouchers = [...new Set(commitments.flatMap((c) => c.vouchers))];
  const [names, clients] = await Promise.all([walletNames(vouchers), walletNames([...new Set(commitments.map((c) => c.client))])]);
  return {
    backers: vouchers.map((w) => names.get(w) ?? short(w)),
    commitments: commitments.map((c) => ({
      ...c,
      clientName: clients.get(c.client) ?? short(c.client),
      milestones: ((ms ?? []) as { pubkey: string; commitment: string; index: number; amount: string; due_ts: string; status: string; released_ts: string | null }[])
        .filter((m) => m.commitment === c.pubkey)
        .map((m) => ({ ...m, payout: (pays ?? []).find((p) => p.milestone_pubkey === m.pubkey) as { npr_amount: string; credited_at: string } | undefined })),
      vestPayout: (pays ?? []).find((p) => p.kind === "retention_vest" && p.commitment === c.pubkey) as { npr_amount: string; credited_at: string } | undefined,
    })),
  };
}

export const nprText = (paisa: string | bigint) => `NPR ${(Number(paisa) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export const dateText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
