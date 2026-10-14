import { NextResponse } from "next/server";
import * as ai from "@insuwork/triage";
import { supabaseServer } from "@/lib/supabase/server";
import { viewer } from "@/lib/data";
import { briefOf, candidatePool, myProject } from "@/lib/projects";

// E-59. POST { project } → ranks backed freelancers with free cover against the brief + plan, saves the shortlist.
// Advisory only (rule 9): the client decides; nothing is contacted, signed or moved.
export const maxDuration = 60;

export async function POST(req: Request) {
  const v = await viewer();
  if (v?.role !== "client") return NextResponse.json({ error: "clients only" }, { status: 403 });
  const { project: id } = await req.json().catch(() => ({}));
  const project = await myProject(String(id ?? ""));
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  let model;
  try {
    ({ model } = await ai.modelFromEnv());
  } catch {
    return NextResponse.json({ error: "the assistant is not configured (AI_PROVIDER / AI_MODEL)" }, { status: 503 });
  }
  try {
    const candidates = await ai.matchFreelancers(model, { ...briefOf(project), plan: project.plan }, await candidatePool());
    const shortlist = { at: new Date().toISOString(), candidates };
    await supabaseServer().from("projects").update({ shortlist }).eq("id", project.id);
    return NextResponse.json(shortlist);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 300) }, { status: 502 });
  }
}
