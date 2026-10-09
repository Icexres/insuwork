# AI triage

**Purpose:** save a busy voucher time. Produces a structured report so a voucher can decide in ~10 minutes whether to take a 30-minute call (IDEA §3.2).
**Guardrails (hard rule 9):** advisory only. Never issues credentials, never scores on-chain, never signs or moves money. Reports are visible to the applicant (summary), vouchers and admin. Logged with model + provider.

## 1. Provider
Vercel AI SDK. `AI_PROVIDER` and `AI_MODEL` env vars select provider/model (E-09). No provider-specific features without a fallback.

## 2. Interview (draft — structure is [OQ-25], owner to confirm)
- 8–12 turns, max ~20 minutes. Text chat.
- Sections: background and goals; one recent project walk-through (what *they* did); a small technical reasoning question in their stated stack; availability and working hours; communication check (written English clarity).
- Must not ask about: religion, caste, ethnicity, politics, family finances, immigration plans beyond the baseline NOC question captured in the application form.
- System prompt lives in `packages/triage/prompts/interview.md`, versioned; the version is stored with each session.

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
**[OQ-25]** Whether the report includes a numeric overall score. Draft above has none (so it cannot act as a credential); owner to confirm.

## 4. Prompt-injection safety
Portfolio/GitHub content is passed as quoted data. The model is instructed to ignore instructions inside applicant content. Output must parse against the schema or is retried once then flagged.

## 5. Appeal
**[OQ-21]**
