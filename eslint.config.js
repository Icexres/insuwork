// W-03: no wallet-adapter import under /freelancer (AGENTS.md hard rule 1).
module.exports = [
  {
    files: ["apps/web/app/(freelancer)/**/*", "apps/web/app/freelancer/**/*"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["*@solana/wallet-adapter*"] }]
    }
  }
];
