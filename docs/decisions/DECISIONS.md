# Decisions log

Settled decisions. Agents must not reopen these. To change one, the owner adds a new row that supersedes it.

## Product decisions (from IDEA.md §15)
| ID | Date | Decision |
|---|---|---|
| P-01 | 2026-10-02 | Credentials, registries or escrow are never *the product*; the bond is. |
| P-02 | 2026-10-02 | No payer who profits when people emigrate. |
| P-03 | 2026-10-08 | AI skill-test → credential rejected as the core. |
| P-04 | 2026-10-08 | Diaspora vouching bond is the core primitive. |
| P-05 | 2026-10-08 | Proof of *paid delivery* replaces proof of skill. |
| P-06 | 2026-10-08 | Nepal side gets NPR only; all crypto offshore with non-residents. |
| P-07 | 2026-10-09 | Bond premium paid by the client, not the freelancer. |
| P-08 | 2026-10-09 | AI agent kept only as advisory triage for vouchers. |
| P-09 | 2026-10-09 | Product name is **InsuWork**, used for program names (`insuwork_*`), SAS schemas (`insuwork.*`), domain and UI. Resolves OQ-11. |

## Engineering decisions (owner, 2026-10-09)
| ID | Decision |
|---|---|
| E-01 | Primary coding agents: Cursor / Codex. Root instructions in `AGENTS.md` + `.cursor/rules/`. `CLAUDE.md` just points to `AGENTS.md`. |
| E-02 | Single monorepo: `programs/`, `apps/web`, `services/`, `packages/`, pnpm workspaces. |
| E-03 | v1 scope includes: on-chain Claims with a 3-person panel, AI triage interview, GitHub merge oracle, real SAS attestations. |
| E-04 | Off-chain: Next.js + Supabase. |
| E-05 | Three Anchor programs: `insuwork_bond`, `insuwork_escrow`, `insuwork_disputes`. |
| E-06 | Milestone release can be triggered by (a) client signature, (b) GitHub oracle key after a verified PR merge, (c) auto-release on timeout when no claim is filed in the window. |
| E-07 | Claims panel v1: InsuWork admin selects 3 panelists from an admin-managed allowlist. **No panelist staking in v1.** (Supersedes the IDEA.md §5.4 nomination model for v1.) |
| E-08 | Conversion partner is a **mock** in the hackathon build (devnet wallet + mock webhook), clearly labelled. |
| E-09 | AI triage is provider-agnostic via the Vercel AI SDK. |
| E-10 | Program tests use LiteSVM / Bankrun (TypeScript). |
| E-11 | UI: Tailwind + shadcn/ui. |
| E-12 | Non-wallet auth: Supabase email (magic link) + Google OAuth. |
| E-13 | Stay Contract retention vest (forgiveness-only) is **in** the hackathon build. |
| E-14 | UI language: English only, with i18n scaffolding. |
| E-15 | Hosting: not decided; code stays hosting-neutral. |
| E-16 | Network: devnet for the hackathon build (IDEA.md §9.3). |
