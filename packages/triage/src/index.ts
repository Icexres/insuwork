// T-27 AI triage (docs/AI-TRIAGE.md, E-51). Advisory only (rule 9): it never issues credentials, never
// scores, never signs or moves money. Provider-agnostic via the Vercel AI SDK (AI_PROVIDER / AI_MODEL).
import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import interviewPrompt from "../prompts/interview.ts";
import reportPrompt from "../prompts/report.ts";

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

/** Validated report; retried once on invalid JSON/schema, then throws (caller flags the session). */
export async function generateReport(model: LanguageModel, app: Application, transcript: Turn[]): Promise<Report> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generateText({
      model,
      system: reportPrompt,
      prompt: `${quoteApp(app)}\n${quoteTranscript(transcript)}${lastError ? `\nYour previous output was invalid: ${lastError}. Return only the JSON object.` : ""}`,
    });
    const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      const parsed = reportSchema.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`report invalid after retry: ${lastError}`);
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
