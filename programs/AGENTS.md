# programs/AGENTS.md — Anchor programs

Spec: `docs/SPEC-onchain.md`. Tests: `docs/TEST-PLAN.md` §1. Read both before editing.

- Three programs: `insuwork_bond`, `insuwork_escrow`, `insuwork_disputes`. Cross-program calls use CPI with **authority PDAs** (`escrow_authority`, `disputes_authority`). Each callee checks the caller PDA against the program IDs stored in its config.
- Every instruction: validate signers, PDA seeds, mint, token-account owners and status transitions with Anchor constraints. Use `checked_*` arithmetic; return a named error, never panic.
- Amounts are `u64` USDC base units (6 decimals). Basis points are `u16`.
- Emit an Anchor event for every state change listed in the spec (indexer and attester depend on them).
- Hard rules from root `AGENTS.md` §5 apply, especially: release destination == registered partner; no pooling; Σcap ≤ deposited; nothing negative about the freelancer.
- Reserve padding (`_reserved: [u8; 64]`) in every account for upgrades.
- Never change an account layout or instruction signature without updating `SPEC-onchain.md` and `packages/sdk`.
- Anything marked `OQ-n` in the spec: stub and ask; do not choose.
