# Build plan (agent backlog)

Dates from IDEA §13. Work top to bottom; a task is done when its done-criteria pass. Tasks tagged `OQ-n` need the owner's answer first (stub otherwise).

## Week 0 (Oct 9–12) — human gates (not agent work)
Demand gate, voucher gate, student survey (IDEA §14). Partner gate by Oct 15. **If gates fail, the owner decides the pivot before Week 2 work continues.**

## Phase 1 — Scaffold (Oct 10–12)
| ID | Task | Done when |
|---|---|---|
| T-01 | Monorepo: pnpm workspaces, Anchor workspace with 3 programs, `apps/web` Next.js + Tailwind + shadcn, packages sdk/shared/triage/attest, services keeper/mock-partner. Pin versions **[OQ-18]** | `pnpm install && anchor build && pnpm --filter web build` succeed |
| T-02 | Lint/format/typecheck, ESLint wallet-import restriction (W-03), CI workflow | CI green on empty project |
| T-03 | Supabase local + first migration (profiles, wallet_links) + RLS | `supabase db reset` works |
| T-04 | LiteSVM/Bankrun test harness with USDC test mint and clock warp helper | sample test passes |

## Phase 2 — Programs (Oct 12–18)
| ID | Task | Done when |
|---|---|---|
| T-10 | `insuwork_bond` accounts + instructions | B-01..B-07 pass |
| T-11 | `insuwork_escrow` config, partner registry, commitment, milestones, fund | E-01..E-03 |
| T-12 | Activate + lock CPI **[OQ-1]** | E-04 |
| T-13 | Release paths (client, oracle, crank) + premium/fee **[OQ-17]** | E-05..E-10 |
| T-14 | `insuwork_disputes` panelists, claims, votes, finalize (majority path) | D-01..D-06 |
| T-15 | Partial/no-majority **[OQ-3]**, claim fee **[OQ-4]**, refund details **[OQ-2]** | D-07, D-08 |
| T-16 | Vest **[OQ-5]**, cancel **[OQ-7]**, voucher≠client **[OQ-13]** | E-11..E-13 |
| T-17 | `packages/sdk`: generated clients, PDA helpers, event decoder | used by tests |
| T-18 | Devnet deploy script; upgrade authority **[OQ-19]**; init configs; register MOCK partner | programs live on devnet |

## Phase 3 — Off-chain + UI (Oct 19–25)
| ID | Task | Done when |
|---|---|---|
| T-20 | Full Supabase schema + RLS (API.md) | W-01, W-02 |
| T-21 | Auth: email magic link + Google; SIWS wallet binding | sign-in works for each role |
| T-22 | Indexer **[OQ-9]** | events mirrored, idempotent |
| T-23 | Attester (SAS schema registration + writer) **[OQ-10]** | W-05; attestation visible on devnet |
| T-24 | Mock partner (KYC, payout, NPR confirmation) | W-06 |
| T-25 | GitHub oracle webhook | W-04 |
| T-26 | Keeper **[OQ-8]** | W-08 |
| T-27 | AI triage (interview, report) **[OQ-25]** | W-07 |
| T-28 | UI: voucher views | VO-1..VO-4 |
| T-29 | UI: client views | CL-1..CL-5 |
| T-30 | UI: freelancer + family + public profile | FR-1..FR-5, FA-1 |
| T-31 | UI: panel + admin | PA-1, AD-1, AD-2 |

## Phase 4 — Real flows + story (Oct 26–Nov 1)
| ID | Task | Done when |
|---|---|---|
| T-40 | E2E Playwright tests | E2E-1, E2E-2 green |
| T-41 | Seed script for demo data (Sita persona etc.) | `pnpm seed:demo` |
| T-42 | Demo rehearsal per DEMO-SCRIPT; README for judges | recorded run < 5 min |
| T-43 | Submission package (README, video, deck) | submitted by Nov 2 |
