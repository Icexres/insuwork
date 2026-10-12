import { NextResponse } from "next/server";
import * as triage from "@insuwork/triage";
import { supabaseService } from "@/lib/supabase/server";
import { viewer } from "@/lib/data";
import { ownApplication } from "@/lib/triage-session";

// POST → { sessionId, message }. Starts the interview from a draft application, or the one allowed retake (E-51).
// AI calls (and the report at the end) outlast serverless defaults.
export const maxDuration = 60;

export async function POST() {
  const v = await viewer();
  if (v?.role !== "freelancer") return NextResponse.json({ error: "freelancers only" }, { status: 403 });
  const app = await ownApplication(v);
  if (!app) return NextResponse.json({ error: "save your application first" }, { status: 400 });
  const db = supabaseService();
  const { data: open } = await db.from("triage_sessions").select("id").eq("application_id", app.id).is("ended_at", null).maybeSingle();
  if (open) return NextResponse.json({ error: "an interview is already in progress", sessionId: open.id }, { status: 409 });

  const { count } = await db.from("triage_sessions").select("id", { count: "exact", head: true }).eq("application_id", app.id);
  const retake = (count ?? 0) > 0;
  if (app.status === "backed") return NextResponse.json({ error: "already backed" }, { status: 409 });
  if (retake && app.retakes_used >= 1) return NextResponse.json({ error: "the one retake has been used" }, { status: 409 });

  let ai;
  try {
    ai = await triage.modelFromEnv();
  } catch {
    return NextResponse.json({ error: "triage is not configured (AI_PROVIDER / AI_MODEL)" }, { status: 503 });
  }
  const first = await triage.interviewTurn(ai.model, app, []);
  const transcript: triage.Turn[] = [{ role: "assistant", content: first.message }];
  const { data: s, error } = await db.from("triage_sessions").insert({
    application_id: app.id, transcript, model: ai.modelId, provider: ai.provider, prompt_version: triage.INTERVIEW_PROMPT_VERSION,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // a retake sends the application back to admin review
  await db.from("applications").update({ status: "triage", retakes_used: app.retakes_used + (retake ? 1 : 0), updated_at: new Date().toISOString() }).eq("id", app.id);
  return NextResponse.json({ sessionId: s.id, message: first.message, maxTurns: triage.MAX_TURNS });
}
