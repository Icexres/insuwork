import { NextResponse } from "next/server";
import * as ai from "@insuwork/triage";
import { supabaseServer } from "@/lib/supabase/server";
import { viewer } from "@/lib/data";
import { briefOf, myProject } from "@/lib/projects";

// E-59. POST { project } → drafts and saves that project's plan; or POST { title, brief, budgetUsd? } (wizard) → plan only.
// Advisory only (rule 9): text suggestions the client edits; nothing is signed or moved.
export const maxDuration = 60;

export async function POST(req: Request) {
  const v = await viewer();
  if (v?.role !== "client") return NextResponse.json({ error: "clients only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const project = body.project ? await myProject(String(body.project)) : null;
  if (body.project && !project) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const brief: ai.Brief = project ? briefOf(project) : {
    title: String(body.title ?? "").trim().slice(0, 120),
    brief: String(body.brief ?? "").trim().slice(0, 4000),
    budgetUsd: Number.isSafeInteger(Number(body.budgetUsd)) && Number(body.budgetUsd) > 0 ? Number(body.budgetUsd) : null,
  };
  if (brief.title.length < 3 || brief.brief.length < 20) return NextResponse.json({ error: "title and brief required" }, { status: 400 });

  let model;
  try {
    ({ model } = await ai.modelFromEnv());
  } catch {
    return NextResponse.json({ error: "the assistant is not configured (AI_PROVIDER / AI_MODEL)" }, { status: 503 });
  }
  try {
    const plan = await ai.planMilestones(model, brief);
    if (project) await supabaseServer().from("projects").update({ plan }).eq("id", project.id);
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 300) }, { status: 502 });
  }
}
