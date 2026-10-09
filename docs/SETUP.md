# Setup

## Toolchain — versions **[OQ-18]**
Record exact versions here at scaffold time (T-01) and in `rust-toolchain.toml`, `.nvmrc`, `Anchor.toml`, `package.json#packageManager`.
| Tool | Version |
|---|---|
| Rust | 1.82.0 (`rust-toolchain.toml`) |
| Solana CLI (Agave) | TBD (OQ-18) |
| Anchor | 0.31.1 (`Anchor.toml`) |
| Node | 24.13.0 (`.nvmrc`) |
| pnpm | 9.12.0 (`package.json#packageManager`) |
| Supabase CLI | TBD |

Windows note: Anchor/Solana tooling is easiest under WSL2 (Ubuntu). Keep the repo inside the WSL filesystem for speed, or accept slower builds on `F:\`.

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
