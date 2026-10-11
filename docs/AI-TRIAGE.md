# AI triage

**Purpose:** save a busy voucher time. Produces a structured report so a voucher can decide in ~10 minutes whether to take a 30-minute call (IDEA §3.2).
**Guardrails (hard rule 9):** advisory only. Never issues credentials, never scores on-chain, never signs or moves money. Reports are visible to the applicant (summary), vouchers and admin. Logged with model + provider.

## 1. Provider
Vercel AI SDK. `AI_PROVIDER` and `AI_MODEL` env vars select provider/model (E-09). No provider-specific features without a fallback.

## 2. Interview (decided, E-51)
- 12–16 turns, max ~30 minutes. Text chat.
- Sections: background and goals; two recent project walk-throughs (what *they* did); a small technical reasoning question in their stated stack; a debugging question; availability and working hours; communication check (written English clarity).
- Must not ask about: religion, caste, ethnicity, politics, family finances, immigration plans beyond the baseline NOC question captured in the application form.
- System prompt lives in `packages/triage/prompts/interview.ts`, versioned; the version is stored with each session.

## 3. Report schema (`report jsonb`, validated with zod)
```json
{
  "version": "triage.v1",
  "summary": "string, ≤ 80 words",
  "stated_skills": ["string"],
  "evidence": [{"claim": "string", "source": "portfolio|github|interview", "url": "string?"}],
  "strengths": ["string"],
  "concerns": ["string"],
  "communication": "clear|adequate|needs_support",
  "suggested_call_questions": ["string"],
  "suitable_starter_tasks": ["string"],
  "confidence": "low|medium|high",
  "disclaimer": "Advisory only. Not a credential."
}
```
No numeric score (E-51): the report must not act as a credential.

## 4. Prompt-injection safety
Portfolio/GitHub content is passed as quoted data. The model is instructed to ignore instructions inside applicant content. Output must parse against the schema or is retried once then flagged.

## 5. Appeal (E-51)
One retake per application: the new report replaces the old. The applicant may add a short written response (≤ 600 chars) that vouchers see beside the report.
