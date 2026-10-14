# UX flows

English only (E-14), shadcn/ui (E-11). Visual direction: Figma dark (E-54). Copy shown to freelancers and families never mentions crypto, USDC, wallets or tokens (hard rule 1): use "contract payment", "guarantee", "backer".

## Public
- `/` — landing: the Sita story, three role CTAs.
- `/p/[freelancerRef]` — public profile: backers (voucher display names, cap band), Paid Delivery Records (date, amount band, client, NPR-credit ✓ with MOCK badge), link to verify each attestation on an explorer.

## Freelancer (email/Google, no wallet)
1. `/freelancer` onboarding stepper: Profile → Portfolio & GitHub → Baseline (NOC/consultancy status, for the study in IDEA §8.2) → Triage interview → Mock KYC → Done.
2. `/freelancer/triage` chat UI with progress, end screen shows report summary.
3. `/freelancer/home` status: application state, backers, active contract milestones (in NPR), profile link + copy button, revoke link (OQ-23), and a printable income statement (received MOCK credits only, estimates kept apart) the freelancer can share with a bank or family (E-57).

## Voucher (wallet)
1. `/voucher` connect wallet → bind (SIWS) → create vault → deposit.
2. `/voucher/applicants` list with triage summary; detail page shows full report, portfolio, "Back this freelancer" form (cap input, shows remaining capacity).
3. `/voucher/dashboard` tiles: deposited, allocated, locked, premiums earned, claims paid; table of backings with live commitments; withdraw.

## Client (wallet)
1. `/client/projects` private project briefs (E-59, not a job board): brief → AI-drafted milestones → AI shortlist of backed freelancers (fit, reasons, first question) → Message / Start commitment.
2. `/client/freelancers` browse backed freelancers (profile + backer + cap), Message any of them.
3. `/client/new` wizard (`?project=` prefills): project title + brief → freelancer → milestones (title, amount, due date in order, deliverables, acceptance criteria, release mode client/GitHub + repo/PR; optional AI draft) → vest (OQ-5) → review totals (salary + 3% premium + 1% fee) → create → fund. Each spec = project context + that milestone's deliverables and criteria.
4. `/client/messages` direct messages with freelancers (also `/voucher/messages`, `/freelancer/messages`; only clients/backers open a conversation, freelancers reply).
5. `/client/commitments/[id]` milestone timeline: Activate, Approve, link PR, File claim (evidence upload), status of claims.

## Panelist (wallet)
- `/panel` assigned claims → claim page: spec, evidence, timeline, vote form, deadline countdown.

## Admin (wallet)
- `/admin` configs, partners (MOCK), oracle key, panelist allowlist, claims queue with "Assign panel", keeper run log, events log.

## States every screen must handle
Loading, empty, error (with retry), wallet not connected, wrong network (must be devnet), transaction pending/confirmed/failed with explorer link.
