# Open questions

**Agents: do not resolve these.** Stub with `OQ-n` and ask the owner. Owner: answer inline, then move the answer to `DECISIONS.md`.

Each item says where it bites and, where `IDEA.md` hints at something, what it says. Nothing here is decided.

## On-chain behaviour
| ID | Question | Blocks | Notes |
|---|---|---|---|
| OQ-1 | **When and how much of a backing is locked?** Lock at milestone activation, one active milestone at a time? Lock amount = `min(milestone.amount, cap − locked)`, or the full cap? | escrow `activate_milestone`, bond `lock` | IDEA §3.1: "part of the backing is locked against that contract's milestones"; §7.1 exposure ≤ 1 month of contract value. |
| OQ-2 | **Upheld claim payout details.** Bond pays `min(milestone.amount, locked)` to client and milestone escrow is refunded (IDEA §5.4). Are that milestone's **premium and platform fee** also refunded to the client? | disputes `finalize`, escrow refund | |
| OQ-3 | **Partial rulings and no-majority.** How are 3 votes combined when they differ (e.g. median of payout bps)? What happens if the 7-day ruling deadline passes without a majority (re-panel, default reject, default uphold)? | disputes `finalize` | |
| OQ-4 | **Claim fee.** Amount, who receives it when the claim is rejected (voucher? treasury?), refunded on upheld (IDEA §7.3). | disputes `file_claim` | |
| OQ-5 | **Retention vest.** Who funds it (client, grant, share of premium — IDEA §16 Q7)? Amount and date (month 12)? Is the vest bonded by the voucher? What does "forgiveness-only" mean mechanically here — vest always pays out to the partner at vest date unless freelancer left? How does the program know the freelancer "stayed"? | escrow vest fields + instruction | |
| OQ-6 | **Treasury.** Which wallet receives the 1% platform fee; is it a Squads multisig on devnet? | escrow config | |
| OQ-7 | **Cancellation.** Can a client cancel before a milestone is activated and get a refund? Can a freelancer withdraw from a commitment? Can a voucher withdraw backing while a commitment is live but no milestone is locked? | escrow `cancel_*`, bond `close_backing` | |
| OQ-15 | **Multiple backings.** Can one freelancer be backed by several vouchers? Can one commitment draw on more than one backing? | bond/escrow layout | v1 spec currently assumes one backing per commitment. |
| OQ-16 | **Late delivery.** If work is delivered after `due_ts`, can the client still approve? Does the claim window start at `due_ts` or at activation? | escrow timing | IDEA: claim within 14 days after due date. |
| OQ-17 | **Premium/fee timing.** Paid per milestone at release (assumed from IDEA "premium on success") — confirm. Funded up front by the client with the salary? | escrow `fund`, `release` | |
| OQ-13 | **Voucher as client.** Block a wallet from being both voucher and client on the same commitment in v1? (IDEA §16 Q6) | escrow `create_commitment` | |
| OQ-19 | **Upgrade authority** for the three programs on devnet: a single dev key or a Squads multisig? | deploy | IDEA §9.4 says multisig during pilot. |

## Off-chain / infra
| ID | Question | Blocks |
|---|---|---|
| OQ-8 | **Where does the auto-release keeper run?** (Hosting not decided.) Cron route, separate worker, or manual crank button for the demo? | services/keeper |
| OQ-9 | **Indexer.** How does Supabase learn about on-chain events: Helius webhooks, RPC log subscription in a worker, or polling? | API, keeper, attester |
| OQ-10 | **SAS issuer key.** SAS attestations are signed by an authorized signer of a credential. Is that a backend key held by InsuWork (delivery) and a mock-partner key (NPR credit)? Check whether SAS accepts a program PDA as signer (IDEA §9.1 says "issuer: the InsuWork program"). | packages/attest |
| OQ-12 | **Salt custody for `freelancer_ref`.** IDEA: partner holds the KYC link. In the mock, where is the salt stored (mock-partner table only)? | SPEC-attestation |
| OQ-14 | **Panelist compensation** in v1 (IDEA §16 Q4). Paid at all in the hackathon? | disputes, admin UI |
| OQ-18 | **Toolchain versions** (Anchor, Solana CLI/Agave, Rust, Node, Next.js). Pin to latest stable at scaffold time, or specific versions you prefer? | SETUP |
| OQ-20 | **Declared relationships (anti-collusion).** Self-declared form only, or admin-verified? Enforced on-chain or off-chain only? | escrow / web |
| OQ-21 | **Triage applicant appeal flow.** IDEA says "applicant can appeal": to whom, and what changes? | triage |
| OQ-22 | **Family access.** Freelancer invites family members by email? How many? Can the freelancer revoke? | web, RLS |
| OQ-23 | **Public profile revocation.** IDEA §5.5: freelancer can revoke the link. Implemented in v1? | web, DB |
| OQ-24 | **USDC mint on devnet.** Circle's devnet USDC faucet mint or our own test mint? | SETUP, config |
| OQ-25 | **Triage interview design.** Confirm the draft sections/length in AI-TRIAGE.md §2 and whether the report has a numeric score. | packages/triage |
| OQ-26 | **Amount bands** for the attestation (SPEC-attestation §3) — confirm the band edges. | packages/attest |
| OQ-27 | **Visual design direction** for the web app (brand colours, tone). | apps/web |
