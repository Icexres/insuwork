# Attestation specification — Paid Delivery Record

Uses the **Solana Attestation Service (SAS)**. Agents: read the current SAS SDK docs before implementing; field encodings below are logical and must be mapped onto SAS's schema types.

## 1. `freelancer_ref`
```
freelancer_ref = sha256( utf8("insuwork:v1:") || partner_kyc_id || salt )   // 32 bytes
```
- `partner_kyc_id`: issued by the (mock) partner at KYC.
- `salt`: 32 random bytes, generated at KYC. Custody **[OQ-12]** (IDEA: partner holds the link to the person).
- Never derived from name, email, phone or bank data alone. Never stored on-chain with any PII.
- Revoking the profile link (IDEA §5.5, **[OQ-23]**) deletes the off-chain `freelancer_ref → person` mapping; attestations remain.

## 2. Credential and issuers (decided: E-44)
Live on devnet; addresses in `deployments/devnet.json` → `sas`. Delivery records: InsuWork attester key. NPR credit: MOCK partner key.

- SAS credential name: `insuwork`.
- Authorized signers **[OQ-10]**: (a) a InsuWork attester key for delivery attestations, (b) the mock-partner key for NPR-credit confirmation. Verify whether SAS accepts a PDA signer; if yes, the owner may choose program-issued.

## 3. Schema `insuwork.paid_delivery.v1`
> As built (E-44): 32-byte fields are Vec<u8>; `voucher` → `vouchers` (concatenated, ≤4); bands are 8 (see E-44) plus `amount_band = 255` + exact `amount` when the freelancer opts in; `npr_credit_confirmed` dropped (option A).

| Field | Type | Source |
|---|---|---|
| freelancer_ref | [u8;32] | Commitment |
| client | Pubkey | Commitment |
| amount_band | u8 | **[OQ-26]** draft bands of milestone amount: 0 <100, 1 100–499, 2 500–999, 3 1,000–2,499, 4 ≥2,500 USDC |
| date | i64 | `released_ts` |
| spec_hash | [u8;32] | Milestone |
| voucher | Pubkey | Commitment |
| commitment | Pubkey | |
| milestone_index | u8 | |
| release_mode | u8 | 0 client, 1 oracle, 2 auto, 3 claim-rejected |
| npr_credit_confirmed | bool | false at write; see §4 |

Attestation nonce/seed: `(commitment, milestone_index)` so it's unique and idempotent.

## 4. NPR credit confirmation
Option A: a second schema `insuwork.npr_credit.v1 {commitment, milestone_index, credited_date, is_mock}` signed by the partner key. Option B: the delivery attestation is closed and re-issued with `npr_credit_confirmed = true`. **Decided: A (E-44).**. In the hackathon the partner is a mock, so `is_mock = true` must be visible on the profile.

## 5. Rules
- Only successful releases produce attestations (hard rule 7). Upheld claims produce **no** freelancer attestation.
- Attestations are written by `packages/attest` after the indexer sees `MilestoneReleased` (or `MilestoneResolved` Rejected). Writer must be idempotent (check existence before create).
- Expiry: none.
