# Open questions

**Agents: do not resolve these.** Stub with `OQ-n` and ask the owner. Owner: answer inline, then move the answer to `DECISIONS.md`.

Each item says where it bites and, where `IDEA.md` hints at something, what it says. Nothing here is decided.

## On-chain behaviour
| ID | Question | Blocks | Notes |
|---|---|---|---|
| OQ-6 | _(Interim: admin-settable, E-23.)_ **Treasury.** Which wallet receives the 1% platform fee; is it a Squads multisig on devnet? | escrow config | |

## Off-chain / infra
| ID | Question | Blocks |
|---|---|---|
| OQ-14 | **Panelist compensation** in v1 (IDEA §16 Q4). Paid at all in the hackathon? | disputes, admin UI |
| OQ-18 | **Toolchain versions** — on-chain part decided (E-17). Still open: Supabase CLI, Next.js (scaffold has 14.2.13). | SETUP |
| OQ-21 | **Triage applicant appeal flow.** IDEA says "applicant can appeal": to whom, and what changes? | triage |
| OQ-22 | _(Deferred by owner until after the full run, E-40.)_ **Family access.** Freelancer invites family members by email? How many? Can the freelancer revoke? | web, RLS |
| OQ-23 | _(Deferred: always public in v1, E-40.)_ **Public profile revocation.** IDEA §5.5: freelancer can revoke the link. Implemented in v1? | web, DB |

| OQ-25 | **Triage interview design.** Confirm the draft sections/length in AI-TRIAGE.md §2 and whether the report has a numeric score. | packages/triage |
| OQ-26 | **Amount bands** for the attestation (SPEC-attestation §3) — confirm the band edges. | packages/attest |
| OQ-27 | **Visual design direction** for the web app (brand colours, tone). | apps/web |
