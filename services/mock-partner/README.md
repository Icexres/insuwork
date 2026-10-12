# MOCK conversion partner (T-24, rule 10)
Not a separate process. The pieces live where they run:
- KYC: `apps/web/app/api/mock-partner/kyc` (freelancer creates MOCK KYC → `freelancer_ref`; salt server-only).
- Payout + NPR confirmation: `mockPartnerPayouts` in `services/indexer/src/effects.ts`, run by the indexer loop when
  `MOCK_PARTNER_SECRET_KEY` is set (MOCK FX in `packages/shared/src/mock-partner.ts`).
Every row is `is_mock = true` (DB check constraint).
