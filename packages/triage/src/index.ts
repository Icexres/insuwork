// T-27 AI triage (docs/AI-TRIAGE.md, E-51). Advisory only (rule 9): it never issues credentials, never
// scores, never signs or moves money. Provider-agnostic via the Vercel AI SDK (AI_PROVIDER / AI_MODEL).
import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import interviewPrompt from "../prompts/interview.ts";
import reportPrompt from "../prompts/report.ts";
import planPrompt from "../prompts/plan.ts";
import matchPrompt from "../prompts/match.ts";

export const INTERVIEW_PROMPT_VERSION = "interview.v1";
export const REPORT_PROMPT_VERSION = "report.v1";
export const MIN_TURNS = 12;
export const MAX_TURNS = 16;
const DONE = "[[INTERVIEW_COMPLETE]]";

export const reportSchema = z.object({
  version: z.literal("triage.v1"),
  summary: z.string().min(1).refine((s) => s.trim().split(/\s+/).length <= 80, "summary ≤ 80 words"),
  stated_skills: z.array(z.string()),
  evidence: z.array(z.object({ claim: z.string(), source: z.enum(["portfolio", "github", "interview"]), url: z.string().optional() })),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  communication: z.enum(["clear", "adequate", "needs_support"]),
  suggested_call_questions: z.array(z.string()).min(1),
  suitable_starter_tasks: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  disclaimer: z.literal("Advisory only. Not a credential."),
}).strict(); // .strict(): an added "score" key fails validation (E-51)
export type Report = z.infer<typeof reportSchema>;

export type Turn = { role: "assistant" | "user"; content: string };
export type Application = { college?: string | null; grad_year?: number | null; skills?: string[]; portfolio_urls?: string[]; github_handle?: string | null };

/** Model from env: AI_PROVIDER = anthropic | openai | google, AI_MODEL = provider model id. Keys come from each provider's env var. */
export async function modelFromEnv(env = process.env): Promise<{ model: LanguageModel; provider: string; modelId: string }> {
  const provider = env.AI_PROVIDER ?? "";
  const modelId = env.AI_MODEL ?? "";
  if (!provider || !modelId) throw new Error("AI_PROVIDER and AI_MODEL must be set");
  if (provider === "mock") {
    // dev/test only: deterministic interviewer + valid report, no API key. Refused in production.
    if (env.NODE_ENV === "production") throw new Error("AI_PROVIDER=mock is not allowed in production");
    return { model: mockModel(), provider, modelId };
  }
  const make = provider === "anthropic" ? (await import("@ai-sdk/anthropic")).anthropic
    : provider === "openai" ? (await import("@ai-sdk/openai")).openai
    : provider === "google" ? (await import("@ai-sdk/google")).google
    : null;
  if (!make) throw new Error(`unsupported AI_PROVIDER ${provider}`);
  return { model: make(modelId), provider, modelId };
}

// applicant-supplied content is quoted data (prompt-injection safety, AI-TRIAGE §4)
const quoteApp = (a: Application) => `<application_data>\n${JSON.stringify(a)}\n</application_data>`;
const quoteTranscript = (t: Turn[]) =>
  `<transcript>\n${t.map((x) => `${x.role === "user" ? "APPLICANT" : "INTERVIEWER"}: ${x.content}`).join("\n")}\n</transcript>`;
const userTurns = (t: Turn[]) => t.filter((x) => x.role === "user").length;

/** Next interviewer message. `done` once the model closes the interview or the hard cap is reached. */
export async function interviewTurn(model: LanguageModel, app: Application, transcript: Turn[]) {
  const turns = userTurns(transcript);
  if (turns >= MAX_TURNS) return { message: "Thank you — the interview is complete.", done: true };
  const pacing = turns + 1 >= MAX_TURNS
    ? "This is the LAST turn: close the interview now."
    : turns + 1 < MIN_TURNS ? `Turn ${turns + 1} of at least ${MIN_TURNS}: do not close yet.` : `Turn ${turns + 1} of at most ${MAX_TURNS}.`;
  const { text } = await generateText({
    model,
    system: `${interviewPrompt}\n${quoteApp(app)}\n${pacing}`,
    messages: transcript.length ? transcript : [{ role: "user", content: "(The applicant has opened the interview. Greet them and ask your first question.)" }],
  });
  const done = text.includes(DONE) && turns + 1 >= MIN_TURNS;
  return { message: text.replace(DONE, "").trim(), done: done || turns + 1 >= MAX_TURNS };
}

/** Model output parsed against `schema`; retried once on invalid JSON/schema, then throws. */
async function generateJson<T>(model: LanguageModel, system: string, data: string, schema: z.ZodType<T>): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generateText({
      model,
      system,
      prompt: `${data}${lastError ? `\nYour previous output was invalid: ${lastError}. Return only the JSON object.` : ""}`,
    });
    const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      const parsed = schema.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`output invalid after retry: ${lastError}`);
}

/** Validated report; retried once on invalid JSON/schema, then throws (caller flags the session). */
export const generateReport = (model: LanguageModel, app: Application, transcript: Turn[]): Promise<Report> =>
  generateJson(model, reportPrompt, `${quoteApp(app)}\n${quoteTranscript(transcript)}`, reportSchema);

// ── E-59 client projects: milestone planner + candidate matcher. Advisory only (rule 9). ─────────────
export const PLAN_PROMPT_VERSION = "plan.v1";
export const MATCH_PROMPT_VERSION = "match.v1";

export const planSchema = z.object({
  milestones: z.array(z.object({
    title: z.string().min(3).max(120),
    deliverables: z.string().min(10),
    acceptance: z.string().min(10),
    amount_usd: z.number().int().positive(),
    days_from_start: z.number().int().positive(),
  })).min(1).max(12),
});
export type Brief = { title: string; brief: string; skills?: string[]; budgetUsd?: number | null; deadline?: string | null };
export type PlannedMilestone = { title: string; deliverables: string; acceptance: string; amountUsd: number; due: string };

const quoteBrief = (b: Brief) => `<project_brief>\n${JSON.stringify(b)}\n</project_brief>`;
const addDays = (today: Date, n: number) => new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Brief → milestone drafts. Amounts are made to add up to the budget (remainder on the last one); due days increase. */
export async function planMilestones(model: LanguageModel, brief: Brief, today = new Date()): Promise<PlannedMilestone[]> {
  const { milestones } = await generateJson(model, planPrompt, quoteBrief(brief), planSchema);
  const out = milestones.map((m) => ({ ...m }));
  const budget = brief.budgetUsd ?? 0;
  const head = out.slice(0, -1).reduce((a, m) => a + m.amount_usd, 0);
  if (budget > head) out[out.length - 1].amount_usd = budget - head;
  let day = 0;
  return out.map((m) => {
    day = Math.max(day + 1, m.days_from_start);
    return { title: m.title, deliverables: m.deliverables, acceptance: m.acceptance, amountUsd: m.amount_usd, due: addDays(today, day) };
  });
}

export const matchSchema = z.object({
  candidates: z.array(z.object({
    id: z.string(),
    fit: z.enum(["strong", "good", "partial"]),
    reasons: z.array(z.string().min(1)).min(1).max(3),
    ask: z.string().min(1),
  }).strict()).max(5), // .strict(): a "score" key fails, like the triage report (E-51)
}).strict();
export type Candidate = { id: string; [k: string]: unknown };
export type Match = z.infer<typeof matchSchema>["candidates"][number];

/** Shortlist of up to 5 candidates, best first. Ids not in `candidates` are dropped, duplicates too. */
export async function matchFreelancers(model: LanguageModel, brief: Brief & { plan?: unknown }, candidates: Candidate[]): Promise<Match[]> {
  if (!candidates.length) return [];
  const data = `${quoteBrief(brief)}\n<candidates>\n${candidates.map((c) => JSON.stringify(c)).join("\n")}\n</candidates>`;
  const { candidates: picked } = await generateJson(model, matchPrompt, data, matchSchema);
  const ids = new Set(candidates.map((c) => c.id));
  const seen = new Set<string>();
  return picked.filter((m) => ids.has(m.id) && !seen.has(m.id) && seen.add(m.id));
}

/** Scripted model for local runs and e2e checks (AI_PROVIDER=mock). */
function mockModel(): LanguageModel {
  const reply = (text: string) => ({
    content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, warnings: [],
    usage: { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } },
  });
  return {
    specificationVersion: "v4", provider: "mock", modelId: "mock-triage", supportedUrls: {},
    doStream: () => Promise.reject(new Error("mock model does not stream")),
    doGenerate: async ({ prompt }: { prompt: { role: string; content: unknown }[] }) => {
      const system = JSON.stringify(prompt.find((m) => m.role === "system")?.content ?? "");
      if (system.includes(PLAN_PROMPT_VERSION)) {
        return reply(JSON.stringify({ milestones: [1, 2, 3].map((n) => ({
          title: `MOCK milestone ${n}`, deliverables: "MOCK: a merged pull request and a short handover note.",
          acceptance: "MOCK: the client can run it and the agreed checks pass.", amount_usd: 300, days_from_start: n * 10,
        })) }));
      }
      if (system.includes(MATCH_PROMPT_VERSION)) {
        const ids = [...new Set(JSON.stringify(prompt).match(/[0-9a-f]{64}/g) ?? [])].slice(0, 3);
        return reply(JSON.stringify({ candidates: ids.map((id) => ({ id, fit: "good", reasons: ["MOCK: skills overlap with the brief."], ask: "MOCK: ask about a similar project." })) }));
      }
      if (system.includes("report.v1")) {
        return reply(JSON.stringify({
          version: "triage.v1", summary: "MOCK report generated without an AI provider.", stated_skills: [], evidence: [],
          strengths: ["MOCK"], concerns: ["MOCK"], communication: "adequate", suggested_call_questions: ["MOCK: ask about their last project."],
          suitable_starter_tasks: [], confidence: "low", disclaimer: "Advisory only. Not a credential.",
        }));
      }
      const turn = Math.max(0, prompt.filter((m) => m.role === "user").length - (prompt.some((m) => JSON.stringify(m.content).includes("has opened the interview")) ? 1 : 0));
      return reply(system.includes("LAST turn") || turn >= MIN_TURNS ? `MOCK: thank you, that is all. ${DONE}` : `MOCK question ${turn + 1}: tell me more.`);
    },
  } as unknown as LanguageModel;
}
