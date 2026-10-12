# AGENTS.md — InsuWork

> Source of truth for every coding agent (Cursor, Codex, Claude, others). Read this file fully at the start of every session, then the nested `AGENTS.md` in the folder you are working in.

## 1. What we are building
InsuWork is a trust layer for Nepali freelancers on Solana. A **voucher** (a non-resident diaspora professional) posts a USDC **bond** behind a specific freelancer. A **client** funds milestone **escrow**. When a milestone is delivered, the salary is released **only to a licensed offshore conversion partner**, which pays the freelancer in NPR. The voucher earns a premium paid by the client. If delivery fails and a **claim** is upheld, the bond pays the client. Each successful release produces a **Paid Delivery Record** (a Solana Attestation Service attestation).

Full product definition: `IDEA.md`. Hackathon scope: `docs/PRD.md`. Deadline: **2026-11-02** (Colosseum, Superteam Nepal track).

## 2. Documents (read the ones relevant to your task)
| File | Use it for |
|---|---|
| `IDEA.md` | Why, who, economics, legal design. Never edit without the owner's approval. |
| `docs/PRD.md` | v1 scope, user stories, acceptance criteria |
| `docs/ARCHITECTURE.md` | Components, data flow, trust boundaries |
| `docs/SPEC-onchain.md` | The three Anchor programs: accounts, PDAs, instructions, errors, invariants |
| `docs/SPEC-attestation.md` | SAS schema `insuwork.paid_delivery.v1` and `freelancer_ref` |
| `docs/API.md` | Supabase schema, route handlers, webhooks, events |
| `docs/UX-FLOWS.md` | Screens per role |
| `docs/AI-TRIAGE.md` | Triage interview, report schema, guardrails |
| `docs/TEST-PLAN.md` | Required tests. A task is not done until its tests pass. |
| `docs/PLAN.md` | Ordered task backlog with done-criteria |
| `docs/SETUP.md` | Toolchain, env vars, local run |
| `docs/DEMO-SCRIPT.md` | What the demo must show |
| `docs/decisions/DECISIONS.md` | Decisions already made. Do not reopen them. |
| `docs/decisions/OPEN-QUESTIONS.md` | Undecided items. **Do not resolve these yourself.** |

## 3. Locked stack (decided by the owner, see DECISIONS.md)
- **Monorepo**, pnpm workspaces.
- **On-chain:** Anchor (Rust), **three programs**: `insuwork_bond`, `insuwork_escrow`, `insuwork_disputes`. Devnet only for the hackathon.
- **Program tests:** LiteSVM / Bankrun in TypeScript (clock warping for the 14-day and 7-day windows).
- **Web:** Next.js (App Router, TypeScript) + Tailwind + shadcn/ui. Solana wallet adapter on **client, voucher and panelist** views only.
- **Off-chain data:** Supabase (Postgres, Auth, Storage). Auth = email (magic link) + Google OAuth for users without wallets.
- **AI:** provider-agnostic via the Vercel AI SDK; provider and model come from env vars.
- **Partner:** a **mock** conversion partner (devnet wallet + mock webhook), clearly labelled "MOCK" in UI and data.
- **Language:** English only, with i18n scaffolding (strings in message files, no hard-coded copy in components).
- **Hosting:** free tiers for the submission (E-56): Vercel + Supabase Free + an external cron calling `/api/indexer/run` and `/api/keeper/run`. Keep code hosting-neutral (no vendor-only APIs without an interface).

## 4. Repository layout
```
/AGENTS.md  /IDEA.md  /Anchor.toml  /pnpm-workspace.yaml
/programs/insuwork_bond      /programs/insuwork_escrow     /programs/insuwork_disputes
/tests/programs/            LiteSVM/Bankrun TS tests
/apps/web/                  Next.js app (UI + route handlers)
/packages/sdk/              Typed program clients, PDA helpers, event decoders
/packages/shared/           Constants, types, zod schemas, i18n messages
/packages/triage/           AI triage logic (Vercel AI SDK)
/packages/attest/           SAS schema + attestation writer
/services/keeper/           Auto-release crank (runtime host TBD)
/services/mock-partner/     Mock conversion partner (labelled MOCK)
/supabase/migrations/       SQL migrations; /supabase/seed.sql
/docs/
```

## 5. Hard rules (non-negotiable — violating any of these is a failed task)
1. **No Nepal resident ever holds, receives or is told to buy crypto.** Freelancers and families have **no wallet**. Never add a wallet connect to freelancer or family views. Never write copy that promotes crypto to Nepali users.
2. **No personal data on-chain.** The freelancer is identified on-chain only by `freelancer_ref` (32-byte hash, see SPEC-attestation). Names, emails, bank details and KYC live off-chain.
3. **Escrow releases go only to a registered partner wallet.** The program must enforce this; never add a code path that pays the freelancer or any other address.
4. **No pooling of bonds.** One `BondVault` per voucher. Never merge voucher funds.
5. **v1 leverage is 1:1.** Sum of backing caps ≤ deposited in a vault.
6. **No tokens, points or transferable reputation.** Attestations are non-transferable records.
7. **Nothing negative about a freelancer is written on-chain.** Failures appear only on the voucher's bond record.
8. **No clawbacks from freelancers.** The retention vest is forgiveness-only.
9. **AI triage is advisory only.** It never issues credentials, never signs transactions, never moves money.
10. **The mock partner is always labelled MOCK** in UI, logs and DB rows.
11. **Secrets** only via env vars. Never commit keypairs or keys. Never log PII.

## 6. How to work
- Pick the next unblocked task in `docs/PLAN.md`. Do one task per branch/PR.
- If a spec is ambiguous or a behaviour is listed in `OPEN-QUESTIONS.md`: **stop and ask the owner**. Do not guess. You may stub the code path with `todo!("OQ-n")` / `throw new Error("OQ-n")` and continue other work.
- Write or update tests first (see TEST-PLAN). Run them before saying a task is done.
- When the spec and code disagree, the spec wins unless the owner changes the spec. If you change behaviour, update the spec in the same PR.
- Keep amounts as integer base units (USDC has 6 decimals). Never use floats for money.
- Conventional commits: `feat(escrow): ...`, `fix(web): ...`, `docs: ...`.

## 7. Commands (fill in exact versions at scaffold time, see SETUP.md)
```
pnpm install
anchor build                 # build all three programs
pnpm test:programs           # LiteSVM/Bankrun tests
pnpm --filter web dev        # Next.js app
pnpm --filter web test       # web unit tests
pnpm lint && pnpm typecheck
supabase start && supabase db reset   # local DB with migrations + seed
```
