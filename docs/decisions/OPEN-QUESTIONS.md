# Open questions

**Agents: do not resolve these.** Stub with `OQ-n` and ask the owner. Owner: answer inline, then move the answer to `DECISIONS.md`.

Each item says where it bites and, where `IDEA.md` hints at something, what it says. Nothing here is decided.

## On-chain behaviour
| ID | Question | Blocks | Notes |
|---|---|---|---|
| OQ-6 | _(Interim: admin-settable, E-23.)_ **Treasury.** Which wallet receives the 1% platform fee; is it a Squads multisig on devnet? | escrow config | |
| OQ-19 | **Upgrade authority** for the three programs on devnet: a single dev key or a Squads multisig? | deploy | IDEA §9.4 says multisig during pilot. |

## Off-chain / infra
| ID | Question | Blocks |
|---|---|---|
| OQ-8 | **Where does the auto-release keeper run?** (Hosting not decided.) Cron route, separate worker, or manual crank button for the demo? | services/keeper |
| OQ-9 | **Indexer.** How does Supabase learn about on-chain events: Helius webhooks, RPC log subscription in a worker, or polling? | API, keeper, attester |
| OQ-10 | **SAS issuer key.** SAS attestations are signed by an authorized signer of a credential. Is that a backend key held by InsuWork (delivery) and a mock-partner key (NPR credit)? Check whether SAS accepts a program PDA as signer (IDEA §9.1 says "issuer: the InsuWork program"). | packages/attest |
| OQ-12 | **Salt custody for `freelancer_ref`.** IDEA: partner holds the KYC link. In the mock, where is the salt stored (mock-partner table only)? | SPEC-attestation |
| OQ-14 | **Panelist compensation** in v1 (IDEA §16 Q4). Paid at all in the hackathon? | disputes, admin UI |
| OQ-18 | **Toolchain versions** — on-chain part decided (E-17). Still open: Supabase CLI, Next.js (scaffold has 14.2.13). | SETUP |
| OQ-20 | **Declared relationships (anti-collusion).** Self-declared form only, or admin-verified? Enforced on-chain or off-chain only? | escrow / web |
| OQ-21 | **Triage applicant appeal flow.** IDEA says "applicant can appeal": to whom, and what changes? | triage |
| OQ-22 | **Family access.** Freelancer invites family members by email? How many? Can the freelancer revoke? | web, RLS |
| OQ-23 | **Public profile revocation.** IDEA §5.5: freelancer can revoke the link. Implemented in v1? | web, DB |

| OQ-25 | **Triage interview design.** Confirm the draft sections/length in AI-TRIAGE.md §2 and whether the report has a numeric score. | packages/triage |
| OQ-26 | **Amount bands** for the attestation (SPEC-attestation §3) — confirm the band edges. | packages/attest |
| OQ-27 | **Visual design direction** for the web app (brand colours, tone). | apps/web |
