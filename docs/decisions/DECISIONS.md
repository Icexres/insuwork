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

## Engineering decisions (owner, 2026-10-10)
| ID | Decision |
|---|---|
| E-17 | Toolchain (resolves OQ-18 for on-chain): Anchor 0.31.1 + Agave 2.1.21, Rust 1.85.0 host toolchain; crates resolved MSRV-aware for SBF cargo 1.79 (`Cargo.lock` committed). Built in Docker (`tools/anchor.Dockerfile`). Supabase CLI and Next.js versions still open. |
| E-18 | Program IDs are real keypairs (git-ignored, `target/deploy/` + backup in `keys/`); same IDs for localnet and devnet. |
| E-19 | Program tests use **LiteSVM** (`litesvm@0.8`, web3.js v1 API), not Bankrun. LiteSVM has no Windows binary: tests run in a Linux container on Windows. Refines E-10. |
| E-20 | OQ-7 (bond part only): a voucher may **not** `close_backing` while any live commitment uses it. Tracked by `Backing.active_commitments`, maintained by escrow via `attach_commitment` / `detach_commitment` CPIs. Client/freelancer cancellation in OQ-7 remains open. |
| E-21 | `min_bond` applies only to a deposit into an empty vault (`deposited == 0`); later top-ups can be any size. |
| E-22 | Admin `set_paused(bool)` on bond (and each program's config). |
| E-23 | OQ-6 interim: treasury is an admin-settable config pubkey; real wallet chosen later. |
| E-24 | OQ-24: demo uses a project-created test mint (6 decimals). Mint is a config value only — swapping to Circle USDC is a config change, no code change. |
| E-25 | OQ-13: a wallet may not be both voucher and client on the same commitment (enforced on-chain in `create_commitment`). |
| E-26 | OQ-15 (partial): a commitment may be covered by **more than one backing**. Split rules pending (see OQ-15 follow-ups). |
| E-27 | OQ-17 (partial): premium is funded **up front**. Premium may be shared between client and freelancer side, chosen per commitment. Exact mechanics pending (see OQ-17 follow-ups). |
| E-28 | OQ-17: freelancer-side share of premium **and** platform fee is **deducted from salary at release**. Split ratio is a **platform default** (`EscrowConfig.freelancer_share_bps`, admin-set); the client only toggles sharing on/off per commitment (`share_with_freelancer`). Client funds `amount + premium + fee − freelancer parts` up front. |
| E-29 | OQ-15: multiple backings per commitment; lock, claim payout and premium are divided **pro rata by cap** (rounding dust to the first backing). |
| E-30 | OQ-1: one Active milestone per commitment at a time (any order). Lock = `min(milestone.amount, free capacity)`: split pro rata by backing caps **snapshotted at commitment creation**, each share clamped to that backing's live `cap − locked`; dust to first backing. Partial lock allowed; zero lock fails `BackingInsufficient`. |
| E-31 | OQ-16 + premium coverage: client may approve before or after `due_ts`. Partner **or** backend key (`EscrowConfig.submitter`) records work submission. Window end = `max(due_ts, submitted_ts) + 14d`; auto-release needs a submission; **one** resubmission from inside the window restarts it. Voucher premium is scaled to the covered fraction `locked / amount` and split pro rata to each backing's actual lock; the uncovered premium (and the matching freelancer-side deduction) is refunded to the client. "More risk = more reward." |
| E-32 | OQ-2 + OQ-4 + claims: on an **upheld** claim the bond pays the client each backing's lock for that milestone, escrow refunds the client's funded salary **and premium** for that milestone, and the treasury **keeps** the client-paid platform fee. A **claim fee** (`DisputesConfig.claim_fee`, admin-set, demo 10 USDC) is held per claim: refunded to the client if upheld, kept by the treasury otherwise. A client may file a claim with nothing delivered, until `due_ts + 14d` (or the submission-based window end, E-31). |
| E-33 | OQ-3: this build supports only Upheld / Rejected votes (no partial rulings). If no 2-of-3 majority exists once the ruling deadline passes, `finalize` resolves as **Rejected** (milestone released, treasury keeps the claim fee). A majority reached before the deadline still applies after it. |
| E-34 | OQ-5 + OQ-7. **Vest:** client sets `vest_amount` and `vest_delay_secs` at `create_commitment` and funds it up front; the clock starts when the last milestone is **released**; anyone may `release_vest` to the partner after the delay unless the partner flags `flag_vest_left` before it, in which case the vest returns to the client (its funder). If the commitment ends on an upheld claim the vest is refunded immediately (agent choice, pending owner confirmation). **Cancel / withdraw** only between milestones (no Active/Disputed milestone). Client `cancel_commitment`: partner receives `cancel_fee_bps` (config, demo 5%) × remaining salary; client gets the rest of escrow incl. vest. Partner `withdraw_commitment`: freelancer forfeits future pay and vest (nothing clawed back); vouchers pay `withdraw_penalty_bps` (config, demo 10%) × remaining salary to the client from free bond capacity, pro rata by snapshot caps, recorded as `claims_paid`; client gets all escrow back. |
| E-35 | Claims: panel assignment stays admin-only with no timeout for an unassigned claim (owner, 2026-10-10). |
| E-36 | Commitments with many backings: `packages/sdk` builds v0 transactions with a per-commitment address lookup table (`commitmentLookupAddresses` / `createLookupTableIxs` / `buildV0Tx`) and raises the compute limit (`MULTI_BACKING_COMPUTE_UNITS`, 4-backing finalize measured ≈ 231k CU). The SDK is TypeScript limited to erasable syntax, consumed as source (no build step); IDLs synced from `target/` by `pnpm sync:idl`. |
| E-37 | OQ-19 (IDEA §9.4): devnet programs deploy with a dedicated deployer key (`keys/deployer.json`, git-ignored, funded by the owner); configs are initialised while the deployer is upgrade authority, then upgrade authority moves to an owner-created **Squads** multisig vault (`pnpm devnet:set-upgrade-authority <vault>`). Config admin stays the deployer key. Service keys (mock partner, treasury, GitHub oracle, submitter) live in `keys/`; public addresses in `deployments/devnet.json`. |
| E-38 | Interim for E-37 (owner, 2026-10-11): Squads unavailable on devnet for now, so the git-ignored deployer key stays upgrade authority; move it to a Squads vault with `pnpm devnet:set-upgrade-authority <vault>` when available, before any non-demo use. Size-optimized builds (opt-level z) rejected: −8% rent but pushed multi-backing calls over the default compute budget. |
