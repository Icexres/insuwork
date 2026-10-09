# Architecture

## 1. Components
| Component | Location | Responsibility |
|---|---|---|
| `insuwork_bond` | programs/ | Voucher vaults, backings, lock/unlock, claim payouts |
| `insuwork_escrow` | programs/ | Commitments, milestones, releases, vest, partner registry |
| `insuwork_disputes` | programs/ | Claims, panelist allowlist, votes, finalize |
| SDK | packages/sdk | Typed clients from IDLs, PDA helpers, event decoding |
| Web app | apps/web | UI for all roles + route handlers (API, webhooks) |
| Supabase | supabase/ | Postgres (off-chain data, mirrors), Auth, Storage (specs, evidence) |
| Indexer | **[OQ-9]** | Mirror program events into Supabase |
| Keeper | services/keeper | Auto-release crank **[OQ-8]** |
| GitHub oracle | apps/web route `/api/webhooks/github` | Verify signed webhook, check merged PR matches milestone, sign `oracle_approve` with oracle key |
| Attester | packages/attest | Write SAS attestations on release events |
| Mock partner | services/mock-partner (+ route `/api/mock-partner/*`) | Mock KYC, fake NPR payouts, NPR-credit confirmation. MOCK. |
| AI triage | packages/triage + route `/api/triage/*` | Interview + report via Vercel AI SDK |

## 2. Trust boundaries
```
[ Nepal side — NO crypto ]            [ Offshore / on-chain ]
 Freelancer (email/Google) ──┐          Voucher wallet ──▶ insuwork_bond
 Family (email/Google) ──────┤          Client wallet  ──▶ insuwork_escrow
                             ▼          Panelist wallet ─▶ insuwork_disputes
                      apps/web (Supabase Auth, RLS)
                             │  reads mirrors only
                             ▼
                      Supabase ◀── indexer ◀── program events
                             ▲
         mock-partner ───────┘ (NPR payouts, MOCK)   attester ──▶ SAS
```
- Freelancer and family sessions can only **read** mirrored data; they never sign transactions.
- Server keys: GitHub oracle key, attester key, mock-partner key, keeper fee-payer. Each is a separate keypair from env (never the upgrade authority).

## 3. Main flows
1. **Onboard freelancer:** sign in → application → triage interview → report → mock KYC → `freelancer_ref` created.
2. **Back:** voucher reviews report → `create_backing(freelancer_ref, cap)`.
3. **Contract:** client creates commitment (specs uploaded to Storage, hashes on-chain) → `fund` → `activate_milestone`.
4. **Release:** approve / oracle / crank → `MilestoneReleased` → indexer → attester writes SAS → mock partner records NPR payout and confirms → family page updates.
5. **Claim:** `file_claim` → admin `assign_panel` → votes → `finalize` → bond pays / milestone released.

## 4. Data ownership
On-chain = money and state machine. Supabase = PII, applications, triage reports, spec/evidence files, mirrors for fast UI, mock-partner records. Mirrors are rebuildable from chain.
