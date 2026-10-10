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

## Keys (all separate, all git-ignored, in `keys/` or env)
Upgrade authority (OQ-19) · admin · GitHub oracle · attester · mock partner · keeper fee payer · test client/voucher/panelist wallets.

## Devnet USDC **[OQ-24]**
Either Circle's devnet USDC (faucet) or a project test mint created by a script. Set `NEXT_PUBLIC_USDC_MINT`.
