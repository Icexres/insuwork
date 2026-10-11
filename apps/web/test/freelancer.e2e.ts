// T-27/T-30: freelancer journey with AI_PROVIDER=mock — application → triage (12–16 turns) → report → admin ready
// → MOCK KYC → voucher sees the applicant → public profile. Run: node --env-file=.env.local test/freelancer.e2e.ts
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { APP, post, service, signIn } from "./session.ts";

const s = await signIn("freelancer");
const html = async (path: string, cookie = s.cookie) => {
  const r = await fetch(APP + path, { headers: { cookie }, redirect: "manual" });
  assert.equal(r.status, 200, path);
  return (await r.text()).replace(/<!-- -->/g, "");
};
assert.ok((await html("/freelancer")).includes("Profile details"), "step 1 shown");

// steps 1–3 as the freelancer through RLS (what the server actions do)
const { data: { session } } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  .auth.signInWithPassword({ email: (await service.auth.admin.getUserById(s.id)).data.user!.email!, password: "e2e-password-1" });
const me = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  global: { headers: { Authorization: `Bearer ${session!.access_token}` } }, auth: { persistSession: false },
});
assert.equal((await me.from("profiles").update({ display_name: "Sita T." }).eq("id", s.id)).error, null);
assert.equal((await me.from("applications").insert({ full_name: "Sita Tamang", college: "Pulchowk", grad_year: 2026, skills: ["React"], portfolio_urls: ["https://example.com"] })).error, null);
assert.equal((await me.from("application_baselines").insert({ open_test_or_consultancy: true, noc_filed: false, consultancy_deposit_paid: false })).error, null);
assert.notEqual((await me.from("applications").update({ status: "ready" }).eq("freelancer_user_id", s.id)).error, undefined);
const { data: still } = await service.from("applications").select("status").eq("freelancer_user_id", s.id).single();
assert.equal(still!.status, "draft", "freelancer can't promote their own application");

// interview
const start = await (await post("/api/triage/start", s.cookie, {})).json();
assert.ok(start.sessionId, JSON.stringify(start));
assert.equal((await post("/api/triage/start", s.cookie, {})).status, 409, "one open interview");
let done = false, turns = 0;
while (!done) {
  const r = await (await post("/api/triage/message", s.cookie, { sessionId: start.sessionId, content: `Answer ${++turns}` })).json();
  done = r.done;
  assert.ok(turns <= 16);
}
assert.ok(turns >= 12 && turns <= 16, `turns ${turns}`);
const { data: app } = await service.from("applications").select("id, status").eq("freelancer_user_id", s.id).single();
assert.equal(app!.status, "triage", "report waits for admin");
const { data: rep } = await service.from("triage_reports").select("report").eq("application_id", app!.id).single();
assert.equal(rep!.report.disclaimer, "Advisory only. Not a credential.");
assert.equal("score" in rep!.report, false);

// voucher can't see it until admin marks ready
const voucher = await signIn("voucher");
assert.ok(!(await html("/voucher/applicants", voucher.cookie)).includes("Sita T."));
await service.from("applications").update({ status: "ready" }).eq("id", app!.id);
assert.ok((await html("/freelancer")).includes("MOCK partner verification"), "step 5 KYC");
const kyc = await (await post("/api/mock-partner/kyc", s.cookie, { bankName: "Nabil Bank", accountNumber: "0012345678" })).json();
assert.match(kyc.freelancer_ref, /^[0-9a-f]{64}$/);
const list = await html("/voucher/applicants", voucher.cookie);
assert.ok(list.includes("Sita T."), "voucher sees the ready applicant");
const detail = await html(`/voucher/applicants/${app!.id}`, voucher.cookie);
assert.ok(detail.includes("MOCK report generated"), "report summary shown to voucher");

// home + public profile render, NPR only
const home = await html("/freelancer/home");
assert.ok(home.includes("NPR") && !home.includes("USDC"), "freelancer sees NPR only");
assert.ok((await html(`/p/${kyc.freelancer_ref}`, "")).includes("Sita T."));
assert.ok((await html("/freelancer/triage")).includes("ONE RETAKE AVAILABLE"));
console.log(`freelancer journey OK (${turns} interview turns)`);
