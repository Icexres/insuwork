# Setup

## Toolchain — versions (E-17; Supabase CLI still OQ-18)
Record exact versions here at scaffold time (T-01) and in `rust-toolchain.toml`, `.nvmrc`, `Anchor.toml`, `package.json#packageManager`.
| Tool | Version |
|---|---|
| Rust | 1.85.0 (`rust-toolchain.toml`); SBF build uses Agave platform-tools (cargo 1.79) |
| Solana CLI (Agave) | 2.1.21 |
| Anchor | 0.31.1 (`Anchor.toml`) |
| Node | 24.13.0 (`.nvmrc`) |
| pnpm | 9.12.0 (`package.json#packageManager`) |
| Supabase CLI | TBD |

## Windows + Docker (no native Rust/Solana needed)
```
pnpm install                 # Windows node_modules (web, packages)
pnpm docker:toolchain        # once: builds insuwork-anchor:0.31.1 (~10 min)
pnpm build:programs          # anchor build in Docker -> target/deploy/*.so, target/idl/*.json
pnpm sync:idl               # copy IDLs/types into packages/sdk/src/idl (commit the result)
pnpm test:programs:docker    # LiteSVM tests in node:24 Linux container (LiteSVM has no Windows binary)
```
Docker volumes `insuwork-cargo`, `insuwork-rustup`, `insuwork-node-modules` cache crates/toolchains/Linux node_modules.
Program keypairs live in `target/deploy/` (git-ignored); a backup copy is in `keys/`. If `target/` is deleted, copy them back before building, or the program IDs change.
If `cargo update` pulls a crate needing edition 2024, regenerate with `CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=fallback cargo generate-lockfile` (programs declare `rust-version = 1.79`) and keep `blake3` at 1.5.5.

Alternative: Anchor/Solana tooling is easiest under WSL2 (Ubuntu). Keep the repo inside the WSL filesystem for speed, or accept slower builds on `F:\`.

## First run
```
pnpm install
solana config set --url devnet
solana-keygen new -o ~/.config/solana/id.json   # dev key, never committed
anchor build && anchor keys sync
pnpm test:programs
supabase start && supabase db reset
cp .env.example apps/web/.env.local   # fill values
pnpm --filter web dev
```

## Devnet deploy (T-18, E-37)
```
# 1. fund the deployer (~11 SOL for three programs): address = solana-keygen pubkey keys/deployer.json
pnpm build:programs && pnpm sync:idl
pnpm deploy:devnet           # deploy/upgrade all three programs
pnpm devnet:init             # test mint, configs, MOCK partner -> deployments/devnet.json
pnpm devnet:set-upgrade-authority <SQUADS_VAULT>   # last: upgrades now need the multisig
```
Live devnet addresses: `deployments/devnet.json`. Upgrade authority is the Squads vault (E-39), so
`pnpm deploy:devnet` can no longer upgrade: write a buffer (`solana program write-buffer`, then
`solana program set-buffer-authority <buffer> --new-buffer-authority <vault>`) and upgrade through a
Squads proposal (app.squads.so on devnet, or `squads-multisig-cli`). The Squads CLI is installed in
the `insuwork-squads-bin` Docker volume at `/opt/squads/bin/squads-multisig-cli` (needs a TTY: wrap it in `script -qec`).

## Keys (all separate, all git-ignored, in `keys/` or env)
Upgrade authority (OQ-19) · admin · GitHub oracle · attester · mock partner · keeper fee payer · test client/voucher/panelist wallets.

## Devnet USDC **[OQ-24]**
Either Circle's devnet USDC (faucet) or a project test mint created by a script. Set `NEXT_PUBLIC_USDC_MINT`.

## Supabase (local, E-40)
Docker must be running. `pnpm db:start` starts the local stack and applies `supabase/migrations`;
`pnpm test:db` runs the pgTAP RLS tests in `supabase/tests`; `pnpm db:reset` reapplies migrations + seed.
The printed local keys are the public Supabase demo keys; never use them outside localhost.

## Web auth (local, E-42)
1. `pnpm db:start`, then copy `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` from `npx supabase status -o env` into
   `apps/web/.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. `pnpm --filter @insuwork/web dev`, open http://localhost:3000/login. Magic-link emails land in Mailpit at http://localhost:54324.
3. Google: set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` and `enabled = true` under `[auth.external.google]` in `supabase/config.toml`.
4. Panelist/admin roles are granted server-side, e.g. `update profiles set role = 'admin' where id = '<user id>'` in the local DB.
5. End-to-end auth check (dev server running): `cd apps/web && node --env-file=.env.local test/auth.e2e.ts`.
Without `NEXT_PUBLIC_SUPABASE_URL` the role guard is off and the demo screens browse freely.

## Indexer (E-43)
`SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm indexer` (optional `SOLANA_RPC_URL`, `INDEXER_POLL_SECS`).
On first start it backfills all program history, then follows live logs and polls every 30 s.

## Attestations (SAS, E-44)
One-time on devnet: `pnpm sas:setup` (creates `keys/attester.json`, funds attester + partner from the deployer,
creates credential `insuwork` and both schemas; idempotent). The indexer writes delivery attestations when
`ATTESTER_SECRET_KEY` (base58 of keys/attester.json) and `SAS_CREDENTIAL_AUTHORITY` (deployer pubkey) are set.
Encoding check against real SAS: `node packages/attest/test/devnet-roundtrip.ts`. Unit tests: `pnpm test:services`.
MOCK partner payouts + NPR attestations: also set `MOCK_PARTNER_SECRET_KEY` (base58 of `keys/mock-partner.json`) for the indexer (E-45).

## GitHub oracle webhook (E-46)
GitHub repo → Settings → Webhooks: payload URL `https://<host>/api/webhooks/github`, content type `application/json`,
secret = `GITHUB_WEBHOOK_SECRET`, events: "Pull requests". The app needs `GITHUB_ORACLE_SECRET_KEY`
(base58 of `keys/github-oracle.json`, the oracle set in the escrow config) and the Supabase service key.
Local testing needs a public tunnel to `localhost:3000`.

## Keeper (E-47)
Every few minutes, either `curl -X POST -H "Authorization: Bearer $KEEPER_RUN_SECRET" https://<host>/api/keeper/run`
or `pnpm keeper` (env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KEEPER_SECRET_KEY`, optional `SOLANA_RPC_URL`).
The keeper key only pays fees; fund it with a little devnet SOL.

## Devnet end-to-end run (E-48)
`pnpm db:start`, web dev server running with `GITHUB_WEBHOOK_SECRET` + `GITHUB_ORACLE_SECRET_KEY` in `apps/web/.env.local`,
`pnpm sas:setup` done, then `pnpm devnet:e2e`. Costs ≈0.2 devnet SOL per run (deployer pays). The public devnet RPC
rate-limits (429s are retried); set `SOLANA_RPC_URL` to a dedicated endpoint for smoother runs.

## Admin, panel and the dispute run (E-53)
- Admin actions must be signed by the config admin wallet (`keys/deployer.json` on devnet): import it into a devnet
  wallet, grant your account `role = 'admin'` in the local DB, and bind that wallet on `/admin`.
- `pnpm devnet:claim` runs one full dispute on devnet (claim → 3 panelists → 2 × Rejected → finalize → attestation);
  result in `deployments/devnet-claim-last.json`.
- Page checks (dev server running): `cd apps/web && for f in auth voucher client freelancer disputes; do node --env-file=.env.local test/$f.e2e.ts; done`.
- Local `.env.local` also needs `KEEPER_SECRET_KEY` and `KEEPER_RUN_SECRET`; `AI_PROVIDER=mock` runs triage without an API key (dev only).

## Playwright E2E (E-55)
`pnpm db:start`, `pnpm sas:setup` once, `apps/web/.env.local` complete (Supabase keys, `GITHUB_WEBHOOK_SECRET`,
`GITHUB_ORACLE_SECRET_KEY`, `KEEPER_SECRET_KEY`, `AI_PROVIDER=mock`), no other `next dev` running, then
`pnpm --filter @insuwork/web exec playwright install chromium` (first time) and `pnpm --filter @insuwork/web e2e`.
It starts its own dev server on :3100 with `NEXT_PUBLIC_E2E_WALLET=1` and the indexer. ≈6 min, ≈0.25 devnet SOL per run.
For reliable runs use a dedicated devnet RPC: `SOLANA_RPC_URL` and `NEXT_PUBLIC_RPC_URL`.

## Free hosting (E-56)
Everything runs on free tiers; there is no long-running process. Programs are already on devnet.

| Piece | Where |
|---|---|
| Web + API routes | Vercel Hobby, project root `apps/web` (pnpm workspace is detected; files outside the root are included) |
| DB + Auth | Supabase Free (pauses after ~7 idle days; the cron below keeps it awake) |
| Indexer + keeper | `POST /api/indexer/run` and `POST /api/keeper/run`, each with `Authorization: Bearer $KEEPER_RUN_SECRET`, called every minute by cron-job.org (or a Cloudflare Worker cron trigger) |
| Email | Gmail SMTP with an app password (no domain needed) |
| RPC | Helius free devnet key |

1. **Supabase.** Create a project, then `npx supabase link --project-ref <ref>` and `npx supabase db push`.
   Auth → URL Configuration: Site URL `https://<app>.vercel.app`, Redirect URLs `https://<app>.vercel.app/auth/callback`.
   Auth → SMTP: `smtp.gmail.com`, port 587, user = the Gmail address, password = a Google
   [app password](https://myaccount.google.com/apppasswords) (needs 2-step verification); raise Auth → Rate Limits → emails/hour.
   Auth → Providers → Google: client from Google Cloud with redirect URI `https://<ref>.supabase.co/auth/v1/callback`;
   publish the OAuth consent screen, or only listed test users can sign in.
2. **Backfill once from your machine** (a 60 s route cannot replay the whole devnet history):
   `SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… SOLANA_RPC_URL=… node services/indexer/src/index.ts`,
   stop it once it goes quiet. Then seed: `pnpm seed:demo` with `apps/web/.env.local` pointed at the hosted project.
3. **Vercel env** (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_RPC_URL`, `SOLANA_RPC_URL`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_ORACLE_SECRET_KEY`, `KEEPER_SECRET_KEY`,
   `KEEPER_RUN_SECRET`, `SAS_CREDENTIAL_AUTHORITY`, `ATTESTER_SECRET_KEY`, `MOCK_PARTNER_SECRET_KEY`, `AI_PROVIDER`,
   `AI_MODEL` + the provider key. Never set `NEXT_PUBLIC_E2E_WALLET`. Keys are base58 secrets; the deployer/admin key stays local.
4. **Cron.** Two cron-job.org jobs, every minute, method POST, header `Authorization: Bearer <KEEPER_RUN_SECRET>`:
   `https://<app>.vercel.app/api/indexer/run` and `…/api/keeper/run`. The indexer route answers
   `{ ok, attester, partner, errors }`; `attester`/`partner` false means their keys are missing in Vercel.
5. **GitHub webhook** payload URL → `https://<app>.vercel.app/api/webhooks/github`.

Trade-off: mirror tables (and pages built on them) trail the chain by up to one cron interval.
