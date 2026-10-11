# API and data

## 1. Supabase schema (public schema; RLS on every table)
| Table | Key columns | RLS (read / write) |
|---|---|---|
| `profiles` | `user_id` (auth.users), `role` enum(freelancer, family, voucher, client, panelist, admin), `display_name` (wallet lives in `wallet_links`) | self / self (`display_name` only; admin/panelist roles server-granted) |
| `wallet_links` | `user_id`, `wallet`, `verified_sig`, `created_at` — wallet users sign a nonce (SIWS) to bind wallet ↔ profile | self / server (after SIWS verify) |
| `applications` | `id`, `freelancer_user_id`, `college`, `grad_year`, `skills[]`, `portfolio_urls[]`, `github_handle`, `status` enum(draft, triage, ready, backed, rejected) | owner, vouchers, admin / owner |
| `triage_sessions` | `id`, `application_id`, `transcript jsonb`, `model`, `provider`, `started_at`, `ended_at` | owner, admin / server |
| `triage_reports` | `id`, `application_id`, `report jsonb` (schema in AI-TRIAGE.md), `created_at` | owner (summary), vouchers, admin / server |
| `partner_kyc` (MOCK) | `freelancer_user_id`, `kyc_id`, `salt`, `freelancer_ref`, `bank_name`, `account_masked`, `is_mock=true` | server only (owner sees masked) — masked via `my_kyc` view (E-40) |
| `family_links` (deferred, OQ-22) | `freelancer_user_id`, `family_user_id`, `invited_email`, `status` | both / freelancer — OQ-22 |
| `commitments` (mirror) | `pubkey`, `client`, `freelancer_ref`, `partner`, `backing`, `voucher`, `status`, totals | parties, family of freelancer, admin / indexer |
| `milestones` (mirror) | `pubkey`, `commitment`, `index`, `amount`, `due_ts`, `spec_hash`, `status`, `release_mode`, `released_ts`, `tx_sig` | same |
| `milestone_specs` | `milestone_pubkey` (nullable until created), `spec_markdown`, `spec_hash`, storage path | parties / client |
| `github_links` | `milestone_pubkey`, `repo`, `pr_number`, `ref_hash` | parties / client |
| `vaults` / `backings` (mirror) | on-chain fields | public read / indexer |
| `claims` (mirror) + `claim_evidence` | evidence files in Storage, `evidence_hash` | parties, panel, admin / client (evidence) |
| `panelists` | `wallet`, `name`, `active` | admin / admin |
| `relationships` | `party_a`, `party_b`, `kind`, `declared_by` | admin / declarer — OQ-20 |
| `payouts` (MOCK) | `milestone_pubkey`, `usdc_amount`, `fx_rate`, `npr_amount`, `credited_at`, `is_mock=true` | freelancer, family, admin / mock-partner |
| `attestations` | `milestone_pubkey`, `schema`, `address`, `tx_sig`, `kind` | public / attester |
| `siws_nonces` | `user_id`, `nonce`, `issued_at` (single use, 5 min) | server only |
| `indexer_cursors` | `program`, `last_sig` | server only |
| `events_raw` | `slot`, `sig`, `program`, `name`, `data jsonb` (key `sig+ix_index+event_index`) | admin / indexer |

FX rate for the mock: `MOCK_NPR_PAISA_PER_USDC` in `packages/shared/src/mock-partner.ts`. MOCK payouts and NPR-credit attestations are written by the indexer loop (E-45).

## 2. Route handlers (`apps/web/app/api/...`)
| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/siws/nonce`, `/api/auth/siws/verify` | POST | session | Bind wallet to profile |
| `/api/applications` | GET/POST/PATCH | freelancer | CRUD own application |
| `/api/triage/start` | POST | freelancer | Create session |
| `/api/triage/message` | POST (stream) | freelancer | Interview turn |
| `/api/triage/finish` | POST | freelancer | Generate report (server) |
| `/api/specs` | POST | client wallet | Upload spec, return `spec_hash` |
| `/api/claims/evidence` | POST | client wallet | Upload evidence, return `evidence_hash` |
| `/api/webhooks/github` | POST | GitHub HMAC secret | On `pull_request.closed && merged`: look up `github_links`, sign `oracle_approve` |
| `/api/mock-partner/kyc` | POST | freelancer | Create MOCK kyc, `freelancer_ref` |
| `/api/keeper/run` | POST | internal secret | Run one keeper pass; called by a scheduled job (E-41) |
| `/api/indexer/*` | — | internal | Live subscription + polling catch-up (E-41) |
| `/api/family/[freelancerUserId]` | GET | family | Schedule + payouts in NPR |

All request/response bodies are defined as zod schemas in `packages/shared/schemas`.

## 3. Event → side-effect map
| Event | Side effects |
|---|---|
| `MilestoneReleased` | mirror update → attester writes `paid_delivery.v1` → mock partner `payout` → NPR confirmation |
| `MilestoneResolved(Rejected)` | same as release |
| `ClaimFiled` | notify admin to assign panel |
| `PanelAssigned` | notify panelists |
| `ClaimFinalized` | mirror update; voucher dashboard |
All handlers idempotent on `(tx_sig, ix_index)`.
