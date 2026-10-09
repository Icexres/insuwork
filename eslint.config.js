// W-03: no wallet-adapter import under /freelancer and /family (AGENTS.md hard rule 1).
module.exports = [
  {
    files: ["apps/web/app/(freelancer)/**/*", "apps/web/app/(family)/**/*", "apps/web/app/freelancer/**/*", "apps/web/app/family/**/*"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["*@solana/wallet-adapter*"] }]
    }
  }
];
