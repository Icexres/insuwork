// T-40: E2E-1 (demo acts 1–3) and E2E-2 (act 4) through the real UI against devnet + local Supabase.
// Prereqs: pnpm db:start, pnpm sas:setup done, apps/web/.env.local filled (see docs/SETUP.md). Run: pnpm e2e
import { defineConfig } from "@playwright/test";

process.loadEnvFile(".env.local"); // Supabase keys, webhook secret, AI_PROVIDER=mock …

const PORT = 3100;
export default defineConfig({
  testDir: "./e2e",
  timeout: 20 * 60_000,
  expect: { timeout: 90_000 },
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", actionTimeout: 60_000 },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_E2E_WALLET: "1" }, // dev-only test wallet (E-54)
  },
});
