// E2E-1 (DEMO-SCRIPT acts 1–3) and E2E-2 (act 4) through the real UI. Real devnet txs, signed by the dev-only
// test wallet; local Supabase; AI_PROVIDER=mock. GitHub's merge notification is simulated with a signed POST.
import { test, expect, type Page } from "@playwright/test";
import { Keypair, actor, bindWallet, confirmed, en, fund, key, mergePr, pk, reloadUntil, service, tick, type, pick } from "./fixtures.ts";

test.describe.configure({ mode: "serial" });

const REPO = "insuwork/e2e-demo";
const PR = Math.floor(Date.now() / 1000);
const TAG = String(PR).slice(-5); // unique persona names per run (earlier runs leave rows behind)
const SITA = `Sita T. ${TAG}`, SITA_FULL = `Sita Tamang ${TAG}`;
const rajan = Keypair.generate(), northwind = Keypair.generate();
const panel = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
let sita: Page, voucher: Page, client: Page, admin: Page;
let ref = "", commitment = "";

test.beforeAll(async ({ browser }) => {
  for (const [k, sol, usdc] of [[rajan, 0.05, 1_500n], [northwind, 0.08, 2_000n], ...panel.map((k) => [k, 0.01, 0n])] as [Keypair, number, bigint][]) {
    await fund(k, sol, usdc); // sequential: the public RPC rate-limits bursts
  }
  const ctx = () => browser.newContext();
  sita = (await actor(ctx, "freelancer", { name: SITA })).page;
  voucher = (await actor(ctx, "voucher", { wallet: rajan, name: "Rajan G." })).page;
  client = (await actor(ctx, "client", { wallet: northwind, name: "Northwind Labs" })).page;
  const deployer = key("deployer");
  await service.from("wallet_links").delete().eq("wallet", pk(deployer));
  admin = (await actor(ctx, "admin", { wallet: deployer, name: "InsuWork Ops" })).page;
});

test("E2E-1 · act 1: Sita applies and interviews, admin approves, MOCK KYC, Rajan bonds and backs her", async () => {
  const f = en.freelancer.application.fields, x = en.freelancer.flow;
  await sita.goto("/freelancer");
  await type(sita.getByLabel(f.fullName, { exact: true }), SITA_FULL);
  await type(sita.getByLabel(f.displayName, { exact: true }), SITA);
  await type(sita.getByLabel(f.college, { exact: true }), "Pulchowk Campus");
  await type(sita.getByLabel(f.gradYear, { exact: true }), "2026");
  await type(sita.getByLabel(f.stack, { exact: true }), "React, TypeScript");
  await tick(sita.getByLabel(en.freelancer.application.consent, { exact: true }));
  await sita.getByRole("button", { name: en.freelancer.application.continue }).click();
  await type(sita.getByLabel(x.portfolio, { exact: true }), "https://example.com/clinic-booking");
  await sita.getByRole("button", { name: x.continueBaseline }).click();
  await sita.getByRole("button", { name: x.continueTriage }).click();

  await sita.waitForURL("**/freelancer/triage");
  await sita.getByRole("button", { name: en.freelancer.triage.start }).click();
  const done = sita.getByText(en.freelancer.triage.doneTitle);
  for (let turn = 1; turn <= 16 && !(await done.isVisible()); turn++) {
    await type(sita.getByLabel(en.freelancer.triage.answer, { exact: true }), `My answer number ${turn}, about the clinic booking app I built.`);
    const reply = sita.waitForResponse((r) => r.url().includes("/api/triage/message"));
    await sita.getByRole("button", { name: en.freelancer.triage.send }).click();
    const { done: finished } = await (await reply).json();
    if (finished) break;
    await expect(sita.getByRole("button", { name: en.freelancer.triage.send })).toBeVisible();
  }
  await expect(done).toBeVisible();

  await admin.goto("/admin/applications");
  const card = admin.locator("section", { hasText: SITA_FULL }).first();
  await card.getByRole("button", { name: en.admin.applications.approve }).click();
  await expect(admin.locator("section", { hasText: SITA_FULL }).first()).toContainText("READY");

  await sita.goto("/freelancer");
  await type(sita.getByLabel(en.freelancer.verify.bank, { exact: true }), "Nabil Bank");
  await type(sita.getByLabel(en.freelancer.verify.account, { exact: true }), "0012345678");
  await sita.getByRole("button", { name: en.freelancer.verify.submit }).click();
  await expect(sita.getByText(x.doneReady)).toBeVisible();
  const { data: kyc } = await service.from("partner_kyc").select("freelancer_ref, freelancer_user_id").eq("bank_name", "Nabil Bank").order("created_at", { ascending: false }).limit(1).single();
  ref = kyc!.freelancer_ref;

  // act 1: Rajan binds his wallet, creates the vault with 1,000, reads Sita's report and backs her for 1,000
  await bindWallet(voucher, "/voucher");
  await type(voucher.getByLabel(en.voucher.setup.amount, { exact: true }), "1000");
  await tick(voucher.getByLabel(en.common.riskAck, { exact: true }));
  await voucher.getByRole("button", { name: en.voucher.empty.createVault }).last().click();
  await confirmed(voucher);
  await voucher.goto("/voucher/applicants");
  await voucher.locator("tr", { hasText: SITA }).getByRole("link", { name: en.voucher.applicants.review }).click();
  await expect(voucher.getByText("MOCK report generated")).toBeVisible();
  await type(voucher.getByLabel(en.voucher.report.decisionLabels.cap, { exact: true }), "1000");
  await tick(voucher.getByLabel(en.common.riskAck, { exact: true }));
  await voucher.getByRole("button", { name: /Back Sita/ }).click();
  await confirmed(voucher, en.voucher.live.alreadyBacked);
});

test("E2E-1 · acts 2–3: Northwind funds 3 milestones; merged PR releases M1; NPR + Paid Delivery Record", async ({ baseURL }) => {
  const w = en.client.new, a = en.client.actions;
  await bindWallet(client, `/client/new?ref=${ref}`);
  await client.goto(`/client/new?ref=${ref}`);
  const due = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
  for (let i = 0; i < 3; i++) {
    if (i > 0) await client.getByRole("button", { name: a.addMilestone }).click();
    const m = client.locator("div.rounded-md", { hasText: a.milestoneN.replace("{n}", String(i + 1)) }).first();
    await type(m.getByLabel(w.amount, { exact: true }), "300");
    await type(m.getByLabel(a.dueDate, { exact: true }), due);
    await type(m.getByLabel(a.spec, { exact: true }), ["Clinic booking page with double-booking guard", "Admin dashboard with CSV export", "Mobile pass: all routes usable at 360px"][i]);
    if (i === 0) {
      await pick(m.getByLabel(w.fields.mode, { exact: true }), "github");
      await type(m.getByLabel(a.repo, { exact: true }), REPO);
      await type(m.getByLabel(a.pr, { exact: true }), String(PR));
    }
  }
  await client.getByRole("button", { name: a.continue }).click();
  await client.getByRole("button", { name: a.continue }).click();
  await expect(client.getByText(w.totals.fund)).toBeVisible();
  await tick(client.getByLabel(a.ack, { exact: true }));
  await client.getByRole("button", { name: /Create & fund/ }).click();
  const failed = client.getByText(new RegExp(en.common.tx.failed));
  await expect(failed.or(client.getByText(en.client.commitment.title).first())).toBeVisible({ timeout: 180_000 });
  if (await failed.isVisible()) throw new Error(`create & fund: ${await failed.textContent()}`);
  await client.waitForURL("**/client/commitments/**", { timeout: 60_000 });
  commitment = client.url().split("/").pop()!;
  expect(commitment).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  await expect(client.getByText("936.00")).toBeVisible(); // 3 × 300 + 3% premium + 1% fee

  await client.getByRole("button", { name: a.activate.replace("{n}", "1") }).click();
  await confirmed(client);

  // act 3: the PR is merged on GitHub → webhook → oracle_approve
  const hook = await mergePr(baseURL!, REPO, PR);
  expect(hook.status, JSON.stringify(hook.body)).toBe(200);
  expect(hook.body.tx).toBeTruthy();
  await reloadUntil(client, /NPR 40,500/); // MOCK payout: 300 × 135

  await sita.goto("/freelancer/home");
  await reloadUntil(sita, /NPR 40,500/);
  await expect(sita.locator("main")).not.toContainText(/\bUSDC\b|\bcrypto|\bwallets?\b|\bSolana\b/i); // rule 1: NPR only

  await sita.goto(`/p/${ref}`);
  await reloadUntil(sita, /explorer\.solana\.com\/address\/\w+\?cluster=devnet/);
  await expect(sita.getByText(en.public.records.title)).toBeVisible();

  await voucher.goto("/voucher/dashboard");
  await reloadUntil(voucher, /9\.00/); // premium 3% of 300
});

test("E2E-2 · act 4: M2 fails, claim upheld by a 3-person panel, bond pays the client, nothing negative for Sita", async () => {
  const a = en.client.actions, x = en.disputes;
  // M2: activate, then the client files a claim with an evidence statement
  await client.goto(`/client/commitments/${commitment}`);
  await client.getByRole("button", { name: a.activate.replace("{n}", "2") }).click();
  await confirmed(client);
  await type(client.getByLabel(a.claimStatement.replace("{n}", "2"), { exact: true }), "The admin dashboard was never delivered; the CSV export does not exist.");
  await client.getByRole("button", { name: en.client.commitment.fileClaim }).click();
  await confirmed(client);

  // admin (config admin wallet) adds three panelists through the UI (on-chain add + name + role), then assigns them
  await bindWallet(admin, "/admin");
  const panelPages: Page[] = [];
  for (const [i, k] of panel.entries()) {
    const p = await actor(() => admin.context().browser()!.newContext(), "panelist", { wallet: k, name: `Panelist ${i + 1}` });
    panelPages.push(p.page);
    const email = (await service.auth.admin.getUserById(p.id)).data.user!.email!;
    await admin.goto("/admin");
    await type(admin.getByLabel(x.panelistWallet, { exact: true }), pk(k));
    await type(admin.getByLabel(x.panelistName, { exact: true }), `Panelist ${i + 1}`);
    await type(admin.getByLabel(x.panelistEmail, { exact: true }), email);
    await admin.getByRole("button", { name: x.addPanelist }).click();
    await confirmed(admin);
  }
  await admin.goto("/admin/claims");
  await reloadUntil(admin, x.assign);
  const card = admin.locator("section", { hasText: x.assign }).first();
  for (let i = 0; i < 3; i++) await pick(card.getByLabel(`${x.panelist} ${i + 1}`, { exact: true }), pk(panel[i]));
  await card.getByRole("button", { name: x.assign }).click();
  await confirmed(admin, "of 3 votes in"); // the assign form is replaced once the panel exists

  // two panelists vote Upheld; the second finalizes
  for (const [i, p] of panelPages.slice(0, 2).entries()) {
    await bindWallet(p, "/panel");
    await reloadUntil(p, en.panel.claims.reviewClaim);
    await p.getByRole("link", { name: en.panel.claims.reviewClaim }).first().click();
    await pick(p.getByLabel(x.ruling, { exact: true }), "upheld");
    await tick(p.getByLabel(x.voteAck, { exact: true }));
    await p.getByRole("button", { name: x.submitVote }).click();
    await confirmed(p, "You voted:"); // the vote form is replaced by the recorded vote
    if (i === 1) {
      await p.reload();
      await p.getByRole("button", { name: x.finalize }).click();
      await confirmed(p, "UPHELD");
    }
  }

  // the bond paid the client; the voucher sees the loss; Sita's public record is unchanged (rule 7)
  await voucher.goto("/voucher/dashboard");
  await reloadUntil(voucher, /Claims paid[\s\S]{0,400}?300\.00/);
  await sita.goto(`/p/${ref}`);
  await expect(sita.locator("tbody tr")).toHaveCount(1);
  await sita.goto("/freelancer/home");
  await expect(sita.locator("main")).not.toContainText(/claim|upheld|failed/i);
});
