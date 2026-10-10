# On-chain specification

Three Anchor programs (E-05). Devnet. USDC = SPL token, 6 decimals (mint per OQ-24). All amounts `u64` base units; rates `u16` basis points; timestamps `i64` unix seconds from `Clock`.

Items marked **[OQ-n]** are undecided: implement the stub, do not choose behaviour.

```
            ┌──────────────────┐   CPI lock/unlock (escrow_authority PDA)   ┌──────────────────┐
 client ───▶│ insuwork_escrow  │──────────────────────────────────────────▶│  insuwork_bond   │◀── voucher
            │ Commitment       │                                            │ BondVault        │
            │ Milestone        │◀─────────┐                                 │ Backing          │
            └──────────────────┘          │ CPI freeze/resolve             └──────────────────┘
                     ▲                    │ (disputes_authority PDA)                ▲
                     │            ┌──────────────────┐   CPI pay_claim             │
                     └────────────│ insuwork_disputes│─────────────────────────────┘
                                  │ Claim, Panelist  │◀── client, panelists, admin
                                  └──────────────────┘
```

## 0. Common
- **Authority PDAs:** `escrow_authority = PDA(["escrow_authority"], escrow_program)`, `disputes_authority = PDA(["disputes_authority"], disputes_program)`. A callee accepts a CPI only if the signer equals the expected authority PDA derived from the program ID stored in its config.
- Every account has `bump: u8` and `_reserved: [u8; 64]`.
- `freelancer_ref: [u8; 32]` (see SPEC-attestation). Never a wallet.
- Events are emitted with `emit!` and named below; the indexer depends on them.

---

## 1. `insuwork_bond`

### Accounts
**BondConfig** — PDA `["bond_config"]`
| Field | Type | Notes |
|---|---|---|
| admin | Pubkey | |
| usdc_mint | Pubkey | |
| escrow_program | Pubkey | for CPI authority check |
| disputes_program | Pubkey | |
| min_bond | u64 | 500_000_000 (500 USDC) |
| paused | bool | blocks deposits/backings |

**BondVault** — PDA `["vault", voucher]`; token account `vault_ata = PDA(["vault_ata", vault])`, authority = vault PDA
| Field | Type | Notes |
|---|---|---|
| voucher | Pubkey | |
| deposited | u64 | current USDC in vault attributable to voucher (decreases on claim payout and withdraw) |
| allocated | u64 | Σ active backing caps |
| locked | u64 | Σ backing.locked |
| claims_paid | u64 | lifetime |
| premiums_earned | u64 | lifetime (premiums are paid to voucher's own ATA, tracked here) |
| backings_count | u32 | |

**Backing** — PDA `["backing", vault, freelancer_ref]`
| Field | Type |
|---|---|
| vault | Pubkey |
| freelancer_ref | [u8;32] |
| cap | u64 |
| locked | u64 |
| active | bool |
| created_ts | i64 |
| active_commitments | u32 | live commitments using this backing (E-20) |

### Invariants
- I-B1 `vault.allocated ≤ vault.deposited` (1:1 leverage).
- I-B2 `backing.locked ≤ backing.cap`; `vault.locked = Σ backing.locked ≤ vault.allocated`.
- I-B3 `vault_ata.amount == vault.deposited` after every instruction.
- I-B4 One vault per voucher; funds never move between vaults.

### Instructions
| Instruction | Signer | Effect | Errors |
|---|---|---|---|
| `init_config(params)` | admin (upgrade authority) | create BondConfig | |
| `set_paused(bool)` | admin | blocks deposit / create_backing | Unauthorized |
| `init_vault()` | voucher | create vault + vault_ata | AlreadyInitialized |
| `deposit(amount)` | voucher | transfer voucher ATA → vault_ata; `deposited += amount`; when the vault is empty (`deposited == 0`) the deposit must be ≥ `min_bond`; later top-ups any size (owner, 2026-10-10) | BelowMinBond, Paused |
| `withdraw(amount)` | voucher | requires `deposited − amount ≥ allocated`; remaining must be 0 or ≥ `min_bond` | InsufficientUnallocated, BelowMinBond |
| `create_backing(freelancer_ref, cap)` | voucher | requires `allocated + cap ≤ deposited`; `allocated += cap` | ExceedsLeverage, Paused |
| `update_cap(new_cap)` | voucher | requires `new_cap ≥ locked` and leverage holds | CapBelowLocked, ExceedsLeverage |
| `close_backing()` | voucher | requires `locked == 0` and `active_commitments == 0` (E-20); `allocated −= cap`, `cap = 0`, `active = false` | BackingLocked, BackingInUse |
| `attach_commitment()` | `escrow_authority` (CPI) | backing must be active; `active_commitments += 1` (called by `create_commitment`) | UnauthorizedCaller, BackingInactive |
| `detach_commitment()` | `escrow_authority` (CPI) | `active_commitments −= 1` (called when a commitment completes or is cancelled) | UnauthorizedCaller |
| `lock(amount)` | `escrow_authority` (CPI) | `backing.locked += amount`, `vault.locked += amount`; requires `locked + amount ≤ cap` **[OQ-1 amount]** | UnauthorizedCaller, ExceedsCap |
| `unlock(amount)` | `escrow_authority` (CPI) | reverse of lock | UnauthorizedCaller |
| `pay_claim(amount, recipient_ata)` | `disputes_authority` (CPI) | transfer vault_ata → client ATA; `deposited −= amount`, `claims_paid += amount`, `backing.locked −= amount`, `vault.locked −= amount`, `backing.cap −= amount`, `allocated −= amount` | UnauthorizedCaller, ExceedsLocked |
| `pay_penalty(amount)` | `escrow_authority` (CPI) | E-34: transfer from vault_ata to client ATA, amount ≤ `cap − locked`; `cap`, `allocated`, `deposited −= amount`; `claims_paid += amount` | UnauthorizedCaller, ExceedsCap |
| `record_premium(amount)` | `escrow_authority` (CPI) | `premiums_earned += amount` (bookkeeping only) | |

### Events
`PausedSet`, `VaultInitialized`, `Deposited`, `Withdrawn`, `BackingCreated`, `BackingCapUpdated`, `BackingClosed`, `CommitmentAttached`, `CommitmentDetached`, `BackingLocked`, `BackingUnlocked`, `ClaimPaid`, `PenaltyPaid`.


---

## 2. `insuwork_escrow`

### Accounts
**EscrowConfig** — PDA `["escrow_config"]`
| Field | Type | Notes |
|---|---|---|
| admin | Pubkey | |
| usdc_mint | Pubkey | |
| bond_program, disputes_program | Pubkey | |
| treasury | Pubkey | **[OQ-6]** |
| github_oracle | Pubkey | oracle signing key |
| submitter | Pubkey | backend key that may record work submission (E-31) |
| premium_bps | u16 | 300 |
| platform_fee_bps | u16 | 100 |
| cancel_fee_bps | u16 | client cancel charge, bps of remaining salary → partner (E-34) |
| withdraw_penalty_bps | u16 | voucher penalty on partner withdrawal, bps of remaining salary → client (E-34) |
| freelancer_share_bps | u16 | platform-default share of premium + fee borne by the freelancer side when a commitment opts in (E-28) |
| claim_window_secs | i64 | 14 days |
| paused | bool | |

**PartnerRecord** — PDA `["partner", partner_wallet]`: `wallet`, `name: [u8;32]`, `is_mock: bool`, `active: bool`. Only admin creates/deactivates.

**Commitment** — PDA `["commitment", client, commitment_id: u64 LE]`; token account `escrow_ata = PDA(["escrow_ata", commitment])`
| Field | Type | Notes |
|---|---|---|
| client | Pubkey | |
| commitment_id | u64 | client-chosen nonce |
| freelancer_ref | [u8;32] | |
| partner | Pubkey | must have active PartnerRecord; **only release destination** |
| backings | [Pubkey; 4] | 1..=4 Backing PDAs, all matching `freelancer_ref` (E-29); lock / claim / premium split pro rata by cap |
| backing_count | u8 | |
| backing_caps | [u64; 4] | caps snapshotted at creation; lock split pro rata by these (E-30) |
| active_milestone | Option<u8> | the single Active milestone (E-30) |
| milestone_count | u8 | max 12 |
| milestones_added | u8 | `add_milestone` calls so far; funding requires `== milestone_count` |
| premium_bps, platform_fee_bps | u16 | copied from config at creation |
| freelancer_share_bps | u16 | config default if client opted in, else 0 (E-28) |
| total_required | u64 | Σ client_due, where client_due = amount + premium + fee − freelancer_part + vest_amount (E-34) |
| funded | u64 | |
| released | u64 | |
| status | enum | Draft → Funded → Active → Completed / Cancelled (E-34) |
| remaining_salary | u64 | Σ salary of milestones not yet closed |
| vest_amount, vest_delay_secs, vest_due_ts | u64, i64, i64 | E-34 |
| vest_status | enum {None, Held, Vesting, Released, Refunded} | |
| created_ts | i64 | |

**Vest (E-34)**: funded by the client up front (part of `total_required`). Held → Vesting when the last milestone is released (`vest_due_ts = now + vest_delay_secs`); Vesting → Released (paid to partner) or Refunded (to client, partner flagged 'left' before the date). Forgiveness-only: nothing ever moves vest funds back from the freelancer side.

**Milestone** — PDA `["milestone", commitment, index: u8]`
| Field | Type | Notes |
|---|---|---|
| commitment | Pubkey | |
| index | u8 | |
| amount | u64 | salary for this milestone |
| due_ts | i64 | |
| spec_hash | [u8;32] | sha256 of spec document (off-chain in Supabase Storage) |
| release_mode | enum {ClientSig, GithubOracle} | ClientSig always allowed as well |
| github_ref_hash | [u8;32] | sha256("owner/repo#pr") when GithubOracle |
| status | enum | Pending → Active → Released / Disputed → Resolved |
| locked_amount | u64 | total locked across backings for this milestone |
| locked_per_backing | [u64; 4] | per-backing lock, same order as `commitment.backings` |
| released_ts | i64 | |
| submitted_ts | i64 | last recorded submission, 0 = none (E-31) |
| submissions | u8 | 0..=2; one restart allowed |

### Status machine (milestone)
```
Pending --activate--> Active --approve | oracle_approve | crank_auto_release--> Released
Active --file_claim (disputes CPI freeze)--> Disputed --resolve(outcome)--> Resolved(Upheld|Rejected|Partial)
Rejected ⇒ normal release path executes inside resolve
```

### Instructions
| Instruction | Signer | Effect / checks | Errors |
|---|---|---|---|
| `init_config(params)` | admin | | |
| `register_partner(wallet, name, is_mock)` / `set_partner_active(bool)` | admin | | |
| `set_oracle(pubkey)` / `set_treasury(pubkey)` / `set_freelancer_share(bps)` / `set_paused(bool)` | admin | treasury interim per E-23 | Unauthorized, InvalidBps |
| `create_commitment(id, freelancer_ref, milestone_count, share_with_freelancer, vest_amount, vest_delay_secs)` + remaining accounts `[vault, backing]×1..4` | client | partner active; each backing active, distinct, `backing.freelancer_ref == freelancer_ref`; each vault's voucher ≠ client (E-25); CPI `bond.attach_commitment` per backing (E-20; `detach_commitment` on Completed/Cancelled); creates escrow_ata; status Draft | InactivePartner, BackingMismatch, InvalidBackings, VoucherIsClient |
| `add_milestone(index, {amount, due_ts, spec_hash, release_mode, github_ref_hash})` | client | Draft; `index == milestones_added`; amount > 0; due_ts in future; `total_required += client_due` | InvalidMilestoneIndex, ZeroAmount, InvalidDueDate |
| `fund(amount)` | client | all milestones added; partial funding allowed; transfer client ATA → escrow_ata; status Funded when `funded == total_required` | Overfund, MilestonesIncomplete, InvalidStatus |
| `activate_milestone(index)` + remaining accounts `[vault, backing]` per backing in order | client | commitment Funded/Active; no other Active milestone; milestone Pending; per backing `lock_i = min(amount·snap_cap_i/Σsnap_caps, cap_i − locked_i)` (E-30); CPI `bond.lock(lock_i)`; milestone Active, commitment Active | MilestoneAlreadyActive, BackingInsufficient, BackingMismatch |
| `submit_milestone(index)` | partner or config.submitter | milestone Active; 1st call sets `submitted_ts`; a 2nd call allowed only while `now ≤ window_end` (restart once) | Unauthorized, NotActive, WindowRestartUsed |
| `approve_milestone(index)` | client | milestone Active (any time, also after due_ts) → `_release` | Unauthorized, NotActive |
| `oracle_approve(index, github_ref_hash)` | github_oracle | release_mode GithubOracle and hash matches → `_release` | WrongOracle, RefMismatch |
| `crank_auto_release(index)` | anyone | submission exists and `now ≥ window_end = max(due_ts, submitted_ts) + claim_window_secs` → `_release` | NotSubmitted, WindowOpen, NotActive |
| `_release` (internal) + remaining `[vault, backing, voucher_ata]` per backing | — | `ReleaseSplit`: partner gets `amount − freelancer_part` (premium part scaled by coverage, rounded up); vouchers get `premium × locked/amount` pro rata to each backing's lock; treasury gets fee; remainder (uncovered premium) refunded to client ATA (owner == client). Destinations checked: partner ATA owner == commitment.partner and partner active, treasury ATA owner == config.treasury, voucher ATA owner == vault.voucher. CPI `bond.unlock` + `bond.record_premium` per backing; on last milestone status Completed + `bond.detach_commitment` | WrongDestination, InactivePartner |
| `freeze_milestone(index)` | `disputes_authority` (CPI) | Active → Disputed | UnauthorizedCaller, NotActive |
| `resolve_milestone(index, outcome)` (Release accounts, authority = disputes_authority) | `disputes_authority` (CPI) | Upheld: refund client its funded salary + premium for this milestone, treasury keeps client-paid fee (E-32), milestone Resolved; Rejected: `_release` from Disputed; Partial: `OutcomeNotSupported` (E-33). Closing the last milestone completes the commitment + detaches backings | UnauthorizedCaller, OutcomeNotSupported |
| `release_vest()` | anyone | Vesting and `now ≥ vest_due_ts` → vest to partner ATA (owner == partner, partner active) | VestNotDue, InvalidStatus |
| `flag_vest_left()` | partner | Vesting and `now < vest_due_ts` → vest refunded to client | Unauthorized, VestDue |
| `cancel_commitment()` + remaining `[vault, backing, vault_ata]` | client | Draft/Funded/Active with no active milestone; `cancel_fee_bps × remaining_salary` → partner, rest of escrow → client; detach backings; Cancelled | MilestoneAlreadyActive, InvalidStatus |
| `withdraw_commitment()` + same remaining | partner | same timing; `withdraw_penalty_bps × remaining_salary` from bonds (CPI `bond.pay_penalty`, pro rata by snapshot caps, clamped to free capacity) → client; all escrow → client; Cancelled | Unauthorized |

### Events
`PartnerRegistered`, `PartnerStatusSet`, `CommitmentCreated`, `MilestoneAdded`, `CommitmentFunded`, `MilestoneActivated {commitment, index, locked_amount, locked_per_backing}`, `MilestoneSubmitted {commitment, index, submitted_ts, window_end}`, `MilestoneReleased {commitment, index, amount, partner_payout, premium, fee, client_refund, partner, freelancer_ref, spec_hash, mode}`, `MilestoneFrozen`, `MilestoneResolved`, `VestReleased`, `VestRefunded`, `CommitmentCancelled {by_partner, charge_to_partner, client_refund, voucher_penalty}`.

### Invariants
- I-E1 Every outgoing salary transfer's destination token-account owner == `commitment.partner` and partner is active.
- I-E2 `escrow_ata.amount == funded − Σ outflows`.
- I-E3 A Disputed milestone can't be released by approve/oracle/crank.
- I-E4 No instruction transfers to an address derived from `freelancer_ref`.

---

## 3. `insuwork_disputes`

### Accounts
**DisputesConfig** — PDA `["disputes_config"]`: `admin`, `usdc_mint`, `escrow_program`, `bond_program`, `treasury`, `ruling_secs` (7 days), `claim_fee` (E-32), `paused`. Claim fee is held in `fee_vault = PDA(["claim_fee", claim])` (authority = claim).

**Panelist** — PDA `["panelist", wallet]`: `wallet`, `active`, `cases_assigned`, `cases_voted`. Admin-managed allowlist (E-07). No stake (E-07).

**Claim** — PDA `["claim", milestone]`
| Field | Type |
|---|---|
| commitment, milestone | Pubkey |
| claimant | Pubkey (client) |
| evidence_hash | [u8;32] |
| panel | [Pubkey;3] (default until assigned) |
| votes | [u8;3] (0 none, 1 Upheld, 2 Rejected, 3 Partial) |
| partial_bps | [u16;3] |
| status | Filed → PanelAssigned → Finalized |
| filed_ts, ruling_deadline | i64 |
| outcome | enum {None, Upheld, Rejected, Partial} |
| payout | u64 |

### Instructions
| Instruction | Signer | Effect | Errors |
|---|---|---|---|
| `init_config` | admin | | |
| `add_panelist(wallet)` / `set_panelist_active` | admin | | |
| `file_claim(index, evidence_hash)` | client of commitment | milestone Active and `now ≤ window_end` (E-31; nothing delivered → due_ts + 14d); transfer `claim_fee` → fee_vault; CPI `escrow.freeze_milestone` | WindowClosed, NotClient, NotActive |
| `assign_panel()` + remaining `[panelist×3, vault per backing]` | admin | 3 distinct active panelists; none equals client or any backing's voucher; **[OQ-20 relationships: off-chain]**; `ruling_deadline = now + ruling_secs` | InvalidPanel |
| `cast_vote(vote, partial_bps)` | panelist in panel | once per panelist, before deadline; only Upheld(1)/Rejected(2) (E-33) | NotPanelist, AlreadyVoted, DeadlinePassed, VoteNotSupported |
| `finalize()` + remaining `[vault, backing, voucher_ata, vault_ata]` per backing | anyone | 2 identical votes → outcome; no majority and `now > ruling_deadline` → Rejected (E-33); otherwise NoMajority. Upheld: CPI `bond.pay_claim(locked_per_backing[i])` to claimant ATA per backing, then `escrow.resolve_milestone(Upheld)`, claim fee refunded. Rejected: `escrow.resolve_milestone(Rejected)`, claim fee → treasury | NoMajority, InvalidStatus, WrongDestination |

### Events
`PanelistAdded`, `ClaimFiled`, `PanelAssigned`, `VoteCast`, `ClaimFinalized {outcome, payout}`.

---

## 4. Worked example (must be a test; IDEA §7.2)
Bond 1,000 USDC, cap 1,000. Commitment 6 × 1,000 USDC, premium 3%, fee 1%.
- All released: partner receives 6,000; voucher premiums 180; treasury 60; vault deposited stays 1,000; allocated 1,000, locked 0.
- Milestone 4 claim upheld (test D-05): bond pays client 1,000; escrow refunds 1,030 (salary + premium); treasury keeps the 10 fee (lock = min(1,000, free 1,000) per E-30); vault deposited 0; voucher net = 90 − 1,000 = −910.
