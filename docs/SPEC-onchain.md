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

### Invariants
- I-B1 `vault.allocated ≤ vault.deposited` (1:1 leverage).
- I-B2 `backing.locked ≤ backing.cap`; `vault.locked = Σ backing.locked ≤ vault.allocated`.
- I-B3 `vault_ata.amount == vault.deposited` after every instruction.
- I-B4 One vault per voucher; funds never move between vaults.

### Instructions
| Instruction | Signer | Effect | Errors |
|---|---|---|---|
| `init_config(params)` | admin (upgrade authority) | create BondConfig | |
| `init_vault()` | voucher | create vault + vault_ata | AlreadyInitialized |
| `deposit(amount)` | voucher | transfer voucher ATA → vault_ata; `deposited += amount`; first deposit total must reach `min_bond` | BelowMinBond, Paused |
| `withdraw(amount)` | voucher | requires `deposited − amount ≥ allocated` (and ≥ min_bond or to zero) | InsufficientUnallocated |
| `create_backing(freelancer_ref, cap)` | voucher | requires `allocated + cap ≤ deposited`; `allocated += cap` | ExceedsLeverage, Paused |
| `update_cap(new_cap)` | voucher | requires `new_cap ≥ locked` and leverage holds | CapBelowLocked, ExceedsLeverage |
| `close_backing()` | voucher | requires `locked == 0` **[OQ-7: may close while a commitment is live but unlocked?]**; `allocated −= cap` | BackingLocked |
| `lock(amount)` | `escrow_authority` (CPI) | `backing.locked += amount`, `vault.locked += amount`; requires `locked + amount ≤ cap` **[OQ-1 amount]** | UnauthorizedCaller, ExceedsCap |
| `unlock(amount)` | `escrow_authority` (CPI) | reverse of lock | UnauthorizedCaller |
| `pay_claim(amount, recipient_ata)` | `disputes_authority` (CPI) | transfer vault_ata → client ATA; `deposited −= amount`, `claims_paid += amount`, `backing.locked −= amount`, `backing.cap −= amount`, `allocated −= amount` | UnauthorizedCaller, ExceedsLocked |
| `record_premium(amount)` | `escrow_authority` (CPI) | `premiums_earned += amount` (bookkeeping only) | |

### Events
`VaultInitialized`, `Deposited`, `Withdrawn`, `BackingCreated`, `BackingCapUpdated`, `BackingClosed`, `BackingLocked`, `BackingUnlocked`, `ClaimPaid`.

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
| premium_bps | u16 | 300 |
| platform_fee_bps | u16 | 100 |
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
| backing | Pubkey | Backing PDA; must match `freelancer_ref` **[OQ-15: single backing]** |
| voucher | Pubkey | read from backing's vault; premium destination |
| milestone_count | u8 | max 12 |
| premium_bps, platform_fee_bps | u16 | copied from config at creation |
| total_required | u64 | Σ(amount + premium + fee) [+ vest per OQ-5] **[OQ-17]** |
| funded | u64 | |
| released | u64 | |
| status | enum | Draft → Funded → Active → Completed / Cancelled **[OQ-7]** |
| vest | Option<VestTerms> | E-13, **[OQ-5]** |
| created_ts | i64 | |

**VestTerms**: `amount: u64`, `vest_ts: i64`, `status: enum {Pending, Released, Forgiven}`. Forgiveness-only: no instruction may ever move vest funds from the freelancer side back. Funding source and release condition **[OQ-5]**.

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
| locked_amount | u64 | amount locked on backing for this milestone |
| released_ts | i64 | |

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
| `set_oracle(pubkey)` | admin | | |
| `create_commitment(id, freelancer_ref, partner, backing, milestones[], vest?)` | client | partner active; backing active and `backing.freelancer_ref == freelancer_ref`; **[OQ-13 voucher≠client]**; creates Milestone PDAs (may be split into `add_milestone` calls for tx size) | InactivePartner, BackingMismatch |
| `fund(amount)` | client | transfer client ATA → escrow_ata; status Funded when `funded == total_required` | Overfund |
| `activate_milestone(index)` | client | commitment Funded/Active; previous milestone not Active **[OQ-1]**; CPI `bond.lock(lock_amount)` where lock_amount **[OQ-1]**; status Active | BackingInsufficient |
| `approve_milestone(index)` | client | milestone Active and no open claim → `_release` | NotActive, Disputed |
| `oracle_approve(index, github_ref_hash)` | github_oracle | release_mode GithubOracle and hash matches → `_release` | WrongOracle, RefMismatch |
| `crank_auto_release(index)` | anyone | `now ≥ due_ts + claim_window_secs`, milestone Active, no claim → `_release` **[OQ-16]** | WindowOpen |
| `_release` (internal) | — | transfer `amount` → partner USDC ATA (owner must == commitment.partner); premium = amount·premium_bps/10_000 → voucher ATA; fee → treasury ATA **[OQ-17]**; CPI `bond.unlock(locked_amount)` and `bond.record_premium`; status Released; emit `MilestoneReleased` | WrongDestination |
| `freeze_milestone(index)` | `disputes_authority` (CPI) | Active → Disputed | |
| `resolve_milestone(index, outcome, payout_bps)` | `disputes_authority` (CPI) | Upheld: refund milestone amount to client **[OQ-2 premium/fee]**; Rejected: run `_release`; Partial **[OQ-3]** | |
| `release_vest()` | **[OQ-5]** | forgiveness-only | |
| `cancel_commitment()` | client | **[OQ-7]** | |

### Events
`PartnerRegistered`, `CommitmentCreated`, `CommitmentFunded`, `MilestoneActivated`, `MilestoneReleased {commitment, index, amount, premium, fee, partner, voucher, freelancer_ref, spec_hash, mode}`, `MilestoneFrozen`, `MilestoneResolved`, `VestReleased`, `CommitmentCancelled`.

### Invariants
- I-E1 Every outgoing salary transfer's destination token-account owner == `commitment.partner` and partner is active.
- I-E2 `escrow_ata.amount == funded − Σ outflows`.
- I-E3 A Disputed milestone can't be released by approve/oracle/crank.
- I-E4 No instruction transfers to an address derived from `freelancer_ref`.

---

## 3. `insuwork_disputes`

### Accounts
**DisputesConfig** — PDA `["disputes_config"]`: `admin`, `escrow_program`, `bond_program`, `ruling_secs` (7 days), `claim_fee` **[OQ-4]**.

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
| `file_claim(evidence_hash)` | client of commitment | milestone Active and `now ≤ due_ts + claim_window` **[OQ-16]**; claim fee **[OQ-4]**; CPI `escrow.freeze_milestone` | WindowClosed, NotClient |
| `assign_panel([p1,p2,p3])` | admin | 3 distinct active panelists; none equals client or voucher; **[OQ-20 relationships]**; `ruling_deadline = now + ruling_secs` | InvalidPanel |
| `cast_vote(vote, partial_bps)` | panelist in panel | once per panelist, before deadline | NotPanelist, AlreadyVoted, DeadlinePassed |
| `finalize()` | anyone | when 2 identical votes exist (majority) → outcome; mixed votes / deadline passed **[OQ-3]**. Upheld: CPI `bond.pay_claim(min(milestone.amount, locked_amount))` to claimant ATA, then CPI `escrow.resolve_milestone(Upheld)`. Rejected: CPI `escrow.resolve_milestone(Rejected)` | NoMajority |

### Events
`PanelistAdded`, `ClaimFiled`, `PanelAssigned`, `VoteCast`, `ClaimFinalized {outcome, payout}`.

---

## 4. Worked example (must be a test; IDEA §7.2)
Bond 1,000 USDC, cap 1,000. Commitment 6 × 1,000 USDC, premium 3%, fee 1%.
- All released: partner receives 6,000; voucher premiums 180; treasury 60; vault deposited stays 1,000; allocated 1,000, locked 0.
- Milestone 4 claim upheld: bond pays client 1,000 (assuming lock = 1,000 per OQ-1); vault deposited 0; voucher net = 90 − 1,000 = −910.
