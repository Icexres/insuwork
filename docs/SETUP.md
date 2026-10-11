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
