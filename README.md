# InsuWork — a trust layer for Nepali freelancers on Solana

**Colosseum · Superteam Nepal track · devnet pilot**

Nepali graduates lose remote work because clients can't price the risk of hiring them. InsuWork lets a
**voucher** (a diaspora professional) post a **USDC bond** behind one specific freelancer. A **client** funds
milestone escrow. When a milestone is delivered, the salary is released **only to a licensed conversion partner**,
which pays the freelancer in **NPR** — nobody in Nepal ever holds crypto. The voucher earns a premium. If delivery
fails and a 3-person panel upholds a claim, the bond pays the client. Every successful delivery becomes a
**Paid Delivery Record** (a Solana Attestation Service attestation) on the freelancer's public profile.

Full product definition: [`IDEA.md`](IDEA.md). Scope: [`docs/PRD.md`](docs/PRD.md). Demo: [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md).

> **Pilot labels.** Devnet only, test USDC. The conversion partner is a **MOCK** (labelled in UI, data and
> attestations). Persona names in the demo are illustrative.

## What's live on devnet

| | Address |
|---|---|
| `insuwork_bond` | [`7DpVomUkF1FfXxsf6gcdvmpFcAZBS7cTm7TvhNSjbKE1`](https://explorer.solana.com/address/7DpVomUkF1FfXxsf6gcdvmpFcAZBS7cTm7TvhNSjbKE1?cluster=devnet) |
| `insuwork_escrow` | [`FuY5Vc1im394GVYyg9v4aRdD2NaLkNnhqcH7j2bCFaKw`](https://explorer.solana.com/address/FuY5Vc1im394GVYyg9v4aRdD2NaLkNnhqcH7j2bCFaKw?cluster=devnet) |
| `insuwork_disputes` | [`FWEXDMyxY1ie6K9gvvcA8SxeRmE4cohfE4j3xYSci4qj`](https://explorer.solana.com/address/FWEXDMyxY1ie6K9gvvcA8SxeRmE4cohfE4j3xYSci4qj?cluster=devnet) |
| Upgrade authority | Squads v4 vault [`4D5svwTbciULpoV1L2PdKN1RP5rv8Y8Lfvmdk2JEZHgX`](https://explorer.solana.com/address/4D5svwTbciULpoV1L2PdKN1RP5rv8Y8Lfvmdk2JEZHgX?cluster=devnet) |
| SAS credential `insuwork` | [`BUyYDy8yTbjuvyp3ZR1X7kzZVv1w91RiYcSuh1wYoarE`](https://explorer.solana.com/address/BUyYDy8yTbjuvyp3ZR1X7kzZVv1w91RiYcSuh1wYoarE?cluster=devnet) — schemas `insuwork.paid_delivery` v1, `insuwork.npr_credit` v1 |
| Test USDC mint | `5tjy2AE1ySZJ1Whc8YeoMmj1y96s2BmiVuh7dYq88NzL` |
| MOCK partner | `9hDeWdgne8JiGcXCVnkKbETyV2whrXP6fgyPCmSzgeUb` |

All public addresses: [`deployments/devnet.json`](deployments/devnet.json). A recorded full run with real numbers
(bond → commitment → client approval → GitHub-merge release → vest → attestations → MOCK NPR payouts):
[`deployments/devnet-e2e-last.json`](deployments/devnet-e2e-last.json); a full dispute (claim → panel → rejected →
release): [`deployments/devnet-claim-last.json`](deployments/devnet-claim-last.json).

## How it works

```
Voucher ──bond (USDC)──▶ BondVault ──1:1 backing──▶ freelancer_ref (hash, no PII)
Client ──salary + 3% premium + 1% fee──▶ Escrow ──release──▶ registered partner ──NPR──▶ freelancer's bank (MOCK)
   │                                          └─▶ premium → voucher · fee → treasury
   └─ claim (evidence hash) ──▶ Disputes: admin-assigned 3-person panel, 2-of-3 vote
                                 upheld → bond pays client · rejected → normal release
Indexer (logs + polling) ──▶ Supabase mirror ──▶ attester (SAS Paid Delivery Record) + MOCK partner (NPR record)
Keeper (scheduled) ──▶ auto-release after the 14-day claim window · retention vest release
GitHub webhook (merged PR) ──▶ oracle_approve
```

| Piece | Where |
|---|---|
| 3 Anchor programs (Anchor 0.31.1) | `programs/` · spec [`docs/SPEC-onchain.md`](docs/SPEC-onchain.md) |
| TypeScript SDK (PDAs, builders, events, lookup tables) | `packages/sdk` |
| Web app — Next.js, role workspaces (voucher, client, freelancer, panel, admin, public profile) | `apps/web` |
| Supabase schema + RLS | `supabase/migrations` |
| Indexer, attester, MOCK partner effects | `services/indexer` |
| Keeper | `services/keeper` |
| SAS schemas + writer | `packages/attest` |
| AI triage interview (advisory, provider-agnostic) | `packages/triage` |

## Hard rules, and how they're enforced

| Rule | Enforcement |
|---|---|
| No Nepal resident holds crypto | Freelancer and family pages have no wallet code — a test follows every import (`apps/web/test/wallet-boundary.test.ts`); their copy is linted for crypto words; amounts shown in NPR only |
| No personal data on-chain | Freelancer is `freelancer_ref = sha256("insuwork:v1:" ‖ kyc_id ‖ salt)`; the salt is server-only (RLS test W-02) |
| Salary only to the registered partner | Program-enforced destination check |
| No bond pooling, 1:1 leverage | One vault per voucher; `Σ caps ≤ deposited` checked on-chain |
| Nothing negative about a freelancer on-chain | Only successful releases are attested; upheld claims hit the voucher's bond record only (E2E-2 asserts the profile is unchanged) |
| MOCK partner always labelled | `is_mock` DB check constraints, MOCK badges, a dedicated NPR-credit schema signed by the mock key |
| AI triage is advisory only | No score in the schema (a `score` key fails validation); admin approval before vouchers see it |

## Run it locally (Windows + Docker is enough)

Prereqs: Node 24, pnpm 9, Docker Desktop. Full guide: [`docs/SETUP.md`](docs/SETUP.md).

```bash
pnpm install
pnpm db:start                       # local Supabase in Docker (prints the local keys)
# apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#   AI_PROVIDER=mock (or anthropic/openai/google + key), GITHUB_WEBHOOK_SECRET, GITHUB_ORACLE_SECRET_KEY, KEEPER_SECRET_KEY
pnpm seed:demo                      # demo personas + on-chain state before act 1 (needs the repo's devnet keys)
pnpm --filter @insuwork/web dev     # http://localhost:3000 — sign in by magic link, email in Mailpit :54324
pnpm indexer                        # mirror + attestations + MOCK payouts (another terminal)
```

The programs are already deployed; rebuilding needs only Docker (`pnpm docker:toolchain && pnpm build:programs`).

## Tests

| Suite | Command | What |
|---|---|---|
| Programs + SDK + indexer (LiteSVM) | `pnpm test:programs:docker` | 53 tests: bonds, escrow money math, claims, vests, cancels, 4-backing lookup-table finalize, indexer idempotency |
| Database RLS (pgTAP) | `pnpm test:db` | salt privacy, role escalation, MOCK constraints |
| Services | `pnpm test:services` | attester idempotency (W-05), MOCK payouts, keeper (W-08), triage schema + prompt-injection (W-07), bands |
| Web unit | `pnpm --filter @insuwork/web test` | SIWS, GitHub HMAC webhook (W-04), wallet boundary (W-03), copy lint (W-09) |
| End-to-end (Playwright, devnet) | `pnpm --filter @insuwork/web e2e` | DEMO-SCRIPT acts 1–4 through the real UI (E2E-1, E2E-2) |

## Decisions and limits

Every product decision is logged in [`docs/decisions/DECISIONS.md`](docs/decisions/DECISIONS.md) (E-01…E-55).
Known limits of the pilot: devnet + test USDC only; MOCK conversion partner; family access and public-profile
revocation are deferred (OQ-22, OQ-23); claim evidence is a text statement (file uploads need Storage);
the public devnet RPC rate-limits heavy use — set `SOLANA_RPC_URL` / `NEXT_PUBLIC_RPC_URL` to a dedicated endpoint.
Production needs a licensed partner, legal review and an external audit.
