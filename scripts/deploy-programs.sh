#!/usr/bin/env bash
# T-18: deploy (or upgrade) the three programs to devnet. Runs inside insuwork-anchor (pnpm deploy:devnet).
# Upgrade authority starts as keys/deployer.json; hand it to the Squads vault with
# scripts/set-upgrade-authority.sh once the multisig exists (IDEA §9.4, E-37).
set -euo pipefail
URL=${SOLANA_URL:-devnet}
for p in insuwork_bond insuwork_escrow insuwork_disputes; do
  echo "== $p ($(solana-keygen pubkey target/deploy/$p-keypair.json))"
  solana program deploy "target/deploy/$p.so" \
    --program-id "target/deploy/$p-keypair.json" \
    --keypair keys/deployer.json \
    --url "$URL" \
    --with-compute-unit-price 1000
done
solana balance --keypair keys/deployer.json --url "$URL"
