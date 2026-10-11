// Server-side triage session handling for the /api/triage routes (T-27). Advisory only (rule 9).
import * as triage from "@insuwork/triage";
import { supabaseService } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/data";

type Session = { id: string; application_id: string; transcript: triage.Turn[]; ended_at: string | null };

export async function ownApplication(v: Viewer) {
  const { data } = await supabaseService().from("applications").select("*").eq("freelancer_user_id", v.id).maybeSingle();
  return data;
}

export async function ownOpenSession(v: Viewer, sessionId: string) {
  const db = supabaseService();
  const { data: s } = await db.from("triage_sessions").select("id, application_id, transcript, ended_at").eq("id", sessionId).maybeSingle();
  const app = await ownApplication(v);
  return s && app && s.application_id === app.id && !s.ended_at ? { session: s as Session, app } : null;
}

/** Report for an ended session; replaces any previous report (retake). Flags the session if the model can't produce a valid one. */
export async function finish(sessionId: string, app: triage.Application & { id: string }, transcript: triage.Turn[]) {
  const db = supabaseService();
  await db.from("triage_sessions").update({ transcript, ended_at: new Date().toISOString() }).eq("id", sessionId);
  try {
    const { model } = await triage.modelFromEnv();
    const report = await triage.generateReport(model, app, transcript);
    await db.from("triage_reports").delete().eq("application_id", app.id);
    await db.from("triage_reports").insert({ application_id: app.id, summary: report.summary, report });
    return { report };
  } catch (e) {
    await db.from("triage_sessions").update({ flagged: true, error: (e as Error).message.slice(0, 500) }).eq("id", sessionId);
    return { flagged: true };
  }
}
