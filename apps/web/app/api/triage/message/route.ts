import { NextResponse } from "next/server";
import * as triage from "@insuwork/triage";
import { supabaseService } from "@/lib/supabase/server";
import { viewer } from "@/lib/data";
import { finish, ownOpenSession } from "@/lib/triage-session";

// POST { sessionId, content } → { message, done, flagged? }. When the interview ends the report is generated
// in the same request (the separate /finish route from API.md is folded in here).
export async function POST(req: Request) {
  const v = await viewer();
  if (v?.role !== "freelancer") return NextResponse.json({ error: "freelancers only" }, { status: 403 });
  const { sessionId, content } = await req.json().catch(() => ({}));
  const text = String(content ?? "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ error: "empty message" }, { status: 400 });
  const own = await ownOpenSession(v, String(sessionId));
  if (!own) return NextResponse.json({ error: "no open interview" }, { status: 404 });

  const { model } = await triage.modelFromEnv();
  const transcript: triage.Turn[] = [...own.session.transcript, { role: "user", content: text }];
  const next = await triage.interviewTurn(model, own.app, transcript);
  transcript.push({ role: "assistant", content: next.message });
  if (!next.done) {
    await supabaseService().from("triage_sessions").update({ transcript }).eq("id", own.session.id);
    return NextResponse.json({ message: next.message, done: false });
  }
  const res = await finish(own.session.id, own.app, transcript);
  return NextResponse.json({ message: next.message, done: true, flagged: !!res.flagged });
}
