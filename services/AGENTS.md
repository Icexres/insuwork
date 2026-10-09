# services/AGENTS.md — background services

- `keeper/`: auto-release crank. Scans milestones past `due_ts + claim_window` with no open claim and calls `crank_auto_release`. Idempotent. Runtime host is **not decided** (OQ-8): write it as a plain Node entrypoint plus an exported function a cron route can call.
- `mock-partner/`: simulates the conversion partner. Receives release events, records a fake NPR payout, calls the attester to write the NPR-credit confirmation. Every record has `is_mock = true`. Never present it as real.
- Services read secrets from env only and log no PII.
