# apps/AGENTS.md — Next.js web app (apps/web)

Specs: `docs/UX-FLOWS.md`, `docs/API.md`, `docs/PRD.md`.

- Next.js App Router, TypeScript strict, Tailwind + shadcn/ui. Server components by default.
- Routes are grouped by role: `/client`, `/voucher`, `/freelancer`, `/family`, `/panel`, `/admin`, public `/p/[freelancerRef]`.
- **Wallet adapter only** under `/client`, `/voucher`, `/panel`, `/admin`. Freelancer and family routes must never import wallet code (enforce with an ESLint `no-restricted-imports` rule).
- Supabase Auth (email magic link + Google) for non-wallet users. Use Row Level Security; never use the service-role key in client components.
- All user-facing strings go through the i18n message files in `packages/shared/i18n/en.json`.
- On-chain calls go through `packages/sdk`; do not hand-build instructions in components.
- Anything that shows mock-partner data shows a visible "MOCK" badge.
