# Test plan

P0 = must pass before demo. Tests that depend on an open question are written once the OQ is answered; until then they are `it.todo("OQ-n …")`.

## 1. Programs (LiteSVM / Bankrun, TS, `tests/programs/`)
Use a test USDC mint with 6 decimals and clock warping.

### bond
| ID | P | Case |
|---|---|---|
| B-01 | P0 | init_vault + deposit ≥ min_bond; vault_ata == deposited |
| B-02 | P0 | deposit below min_bond on first deposit fails `BelowMinBond` |
| B-03 | P0 | create_backing within leverage succeeds; allocated updated |
| B-04 | P0 | create_backing exceeding deposited fails `ExceedsLeverage` |
| B-05 | P0 | withdraw below allocated fails |
| B-06 | P0 | lock/unlock called directly by a user (not escrow_authority) fails `UnauthorizedCaller` |
| B-07 | P0 | pay_claim called by non-disputes authority fails |
| B-08 | P1 | update_cap below locked fails |
| B-09 | P1 | two vouchers' vaults are independent (no cross-vault movement) |
| B-10 | P1 | close_backing with locked > 0 fails |

### escrow
| ID | P | Case |
|---|---|---|
| E-01 | P0 | create_commitment with inactive partner fails |
| E-02 | P0 | backing/freelancer_ref mismatch fails |
| E-03 | P0 | fund exact total → Funded; overfund fails |
| E-04 | P0 | activate locks backing (OQ-1 amount) |
| E-05 | P0 | approve releases: partner gets amount, voucher premium (3%), treasury fee (1%), backing unlocked, `MilestoneReleased` emitted |
| E-06 | P0 | release to a token account not owned by partner fails `WrongDestination` |
| E-07 | P0 | oracle_approve with wrong key fails; with right key + matching ref releases |
| E-08 | P0 | crank before window fails `WindowOpen`; after window releases |
| E-09 | P0 | disputed milestone can't be approved, oracle-approved or cranked |
| E-10 | P0 | **Worked example happy path** (SPEC §4): 6 milestones → 6,000 partner / 180 voucher / 60 treasury |
| E-11 | P1 | vest behaviour (OQ-5); assert no path returns vest funds from freelancer side |
| E-12 | P1 | cancel rules (OQ-7) |
| E-13 | P1 | voucher-as-client rule (OQ-13) |

### disputes
| ID | P | Case |
|---|---|---|
| D-01 | P0 | file_claim by non-client fails |
| D-02 | P0 | file_claim after window fails `WindowClosed` |
| D-03 | P0 | assign_panel with inactive/duplicate panelist or with client/voucher fails |
| D-04 | P0 | non-panelist vote fails; double vote fails; vote after deadline fails |
| D-05 | P0 | 2 Upheld → bond pays client min(amount, locked); milestone refunded; **worked example: voucher net −910** |
| D-06 | P0 | 2 Rejected → milestone released normally + attestation event |
| D-07 | P1 | partial / no-majority (OQ-3) |
| D-08 | P1 | claim fee handling (OQ-4) |

### invariants (property-style, P1)
After random sequences of valid instructions: I-B1..I-B4, I-E1..I-E4 hold.

## 2. Off-chain
| ID | P | Case |
|---|---|---|
| W-01 | P0 | RLS: family user can read only linked freelancer's milestones/payouts |
| W-02 | P0 | RLS: freelancer cannot read `partner_kyc.salt` |
| W-03 | P0 | No wallet code reachable (transitively) from `/freelancer`, `/family`, `/p` — `apps/web/test/wallet-boundary.test.ts` (E-53) |
| W-04 | P0 | GitHub webhook: bad HMAC rejected; unmerged PR ignored; merged matching PR triggers one `oracle_approve` (idempotent on redelivery) |
| W-05 | P0 | Attester idempotent: same release event twice → one attestation |
| W-06 | P0 | Mock partner records have `is_mock=true`; UI shows MOCK badge |
| W-07 | P1 | Triage report validates against zod schema; injection string in portfolio does not change system behaviour |
| W-08 | P1 | Keeper pass is idempotent and skips disputed milestones |
| W-09 | P1 | Copy lint: freelancer/family message keys contain none of: crypto, USDC, wallet, token, Solana |

## 3. End-to-end (devnet, Playwright, P0)
- E2E-1 Happy path from DEMO-SCRIPT acts 1–3.
- E2E-2 Claim upheld from DEMO-SCRIPT act 4.
