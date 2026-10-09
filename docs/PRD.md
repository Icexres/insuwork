# PRD — InsuWork v1 (hackathon build)

| | |
|---|---|
| Deadline | 2026-11-02 (Colosseum, Superteam Nepal track) |
| Network | Solana devnet |
| Source | `IDEA.md` v0.1, decisions in `docs/decisions/DECISIONS.md` |

## 1. Goal
Demonstrate the full lifecycle of one **bonded contract** end to end: voucher bonds → backs a freelancer → client funds milestones → delivery → release to (mock) partner → premium to voucher → Paid Delivery attestation → NPR shown on the family page; plus one claim that the panel upholds and the bond pays.

## 2. In scope (v1)
| # | Feature | Notes |
|---|---|---|
| F1 | Bond vault per voucher: deposit, withdraw unallocated | `insuwork_bond` |
| F2 | Backing: voucher backs a `freelancer_ref` with a cap; Σcap ≤ deposited | `insuwork_bond` |
| F3 | Commitment with milestones, funded by client in USDC (salary + premium + fee) | `insuwork_escrow` |
| F4 | Lock backing against active milestone | OQ-1 |
| F5 | Release by client signature, GitHub oracle, or auto-release after the claim window | E-06 |
| F6 | Release goes only to registered partner wallet; premium to voucher; fee to treasury | OQ-6, OQ-17 |
| F7 | Retention vest (forgiveness-only) | E-13, OQ-5 |
| F8 | Claims: client files within window; admin assigns 3 panelists from allowlist; vote; finalize; bond pays | E-07, OQ-2/3/4 |
| F9 | Paid Delivery Record: SAS attestation on every release; NPR-credit confirmation by mock partner | OQ-10 |
| F10 | Mock conversion partner, labelled MOCK | E-08 |
| F11 | AI triage interview → report for vouchers (advisory) | E-09 |
| F12 | Web app views: client, voucher, freelancer, family, panel, admin, public profile | UX-FLOWS |
| F13 | Auth: wallets for client/voucher/panel/admin; Supabase email + Google for freelancer/family | E-12 |

## 3. Out of scope (v1)
zkTLS history import, work-session/liveness attestation, AI milestone check, decentralised jury, panelist staking, real conversion partner, mainnet, Nepali translation, tokens of any kind.

## 4. Roles
Freelancer (no wallet) · Family (read-only, no wallet) · Voucher (wallet) · Client (wallet / Squads) · Panelist (wallet) · Admin/InsuWork operator (wallet) · Mock partner (service key).

## 5. User stories and acceptance criteria

### Freelancer
- **FR-1** As a freelancer I sign in with email or Google and complete an application (profile, portfolio links, GitHub handle).
  - AC: no wallet UI anywhere; application stored in Supabase; status visible.
- **FR-2** I complete the AI triage interview.
  - AC: chat-style interview; a structured report is generated and attached to my application; I can see that it exists and its summary (OQ-21 for appeals).
- **FR-3** I complete mock KYC with the partner.
  - AC: mock partner creates a `kyc_id`; `freelancer_ref` is derived (SPEC-attestation); my bank account (fake) is stored only in the mock-partner table, marked MOCK.
- **FR-4** I see my public profile link `/p/{freelancer_ref}` listing my Paid Delivery Records and backers.
  - AC: page reads on-chain attestations; shows no negative records.
- **FR-5** I invite family members (OQ-22).

### Family
- **FA-1** As a family member I sign in and see a read-only schedule: milestones, amounts in NPR (mock FX), what has landed.
  - AC: no wallet, no crypto words in copy ("contract payment", not "USDC"); MOCK badge on partner data; data limited by RLS to the linked freelancer.

### Voucher
- **VO-1** Connect wallet, create my Bond Vault, deposit devnet USDC.
  - AC: one vault per wallet; deposit reflected on-chain and in dashboard.
- **VO-2** Review applicants with triage reports and decide to back one with a cap.
  - AC: `create_backing` fails if Σcap would exceed deposited.
- **VO-3** Dashboard: deposited, allocated, locked, premiums earned, claims paid, per-backing status.
- **VO-4** Withdraw unallocated USDC. AC: cannot withdraw below `allocated`.

### Client
- **CL-1** Connect wallet; browse backed freelancers; create a commitment with milestones (amount, due date, spec, release mode), premium 3%, fee 1%, optional vest.
  - AC: spec text stored off-chain, `spec_hash` on-chain; voucher-as-client rule per OQ-13.
- **CL-2** Fund the commitment in USDC.
- **CL-3** Approve a delivered milestone → release.
  - AC: salary → partner ATA, premium → voucher, fee → treasury, backing unlocked, attestation written.
- **CL-4** Link a milestone to a GitHub repo/PR; merge triggers oracle release.
- **CL-5** File a claim with evidence within the window.
  - AC: milestone frozen; cannot be released while claim open.

### Panelist
- **PA-1** See assigned claims, evidence, spec; cast vote (Upheld / Rejected / Partial).
  - AC: only assigned panelists can vote; vote before deadline.

### Admin
- **AD-1** Initialise configs, register partner wallet, set oracle key, manage panelist allowlist, assign panels.
- **AD-2** View all commitments, claims, keeper runs.

### System
- **SY-1** Keeper auto-releases milestones past window with no claim (OQ-8).
- **SY-2** Mock partner records a fake NPR payout for every release and writes the NPR-credit confirmation (OQ-10).
- **SY-3** Indexer mirrors on-chain events to Supabase (OQ-9).

## 6. Fixed parameters (from IDEA §7.1)
| Parameter | Value |
|---|---|
| Minimum bond | 500 USDC |
| Leverage | 1:1 |
| Premium | 300 bps of milestone value, client-paid |
| Platform fee | 100 bps of released payroll, client-paid |
| Claim window | 14 days after `due_ts` |
| Ruling deadline | 7 days after panel assignment |
Parameters live in program config accounts so they can be changed without redeploy.

## 7. Success criteria for the demo
- Full happy path on devnet with 3 milestones, from UI, in < 5 minutes.
- One claim upheld, bond pays client, voucher dashboard shows loss.
- Public profile shows ≥ 1 Paid Delivery Record with NPR-credit confirmed (MOCK).
- All TEST-PLAN P0 tests green.
