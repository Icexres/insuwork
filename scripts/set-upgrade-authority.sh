#!/usr/bin/env bash
# Hand upgrade authority of all three programs to the Squads vault (IDEA §9.4, E-37).
# Usage (inside insuwork-anchor): bash scripts/set-upgrade-authority.sh <SQUADS_VAULT_ADDRESS>
# After this, upgrades go through Squads proposals; the deployer key can no longer upgrade.
set -euo pipefail
VAULT=${1:?usage: set-upgrade-authority.sh <squads vault address>}
URL=${SOLANA_URL:-devnet}
for p in insuwork_bond insuwork_escrow insuwork_disputes; do
  solana program set-upgrade-authority "$(solana-keygen pubkey target/deploy/$p-keypair.json)" \
    --new-upgrade-authority "$VAULT" --skip-new-upgrade-authority-signer-check \
    --keypair keys/deployer.json --url "$URL"
done
