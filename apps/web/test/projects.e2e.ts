// E-59: project briefs + AI planner/matcher routes, and the three inboxes. Needs dev server + local Supabase,
// AI_PROVIDER=mock. Run: node --env-file=.env.local test/projects.e2e.ts
import assert from "node:assert/strict";
import { APP, post, service, signIn } from "./session.ts";

const client = await signIn("client");
const other = await signIn("client");
const freelancer = await signIn("freelancer");
const page = async (path: string, cookie: string) => {
  const r = await fetch(APP + path, { headers: { cookie } });
  assert.equal(r.status, 200, path);
  return (await r.text()).replace(/<!-- -->/g, "");
};

const { data: project, error } = await service.from("projects")
  .insert({ client_user_id: client.id, title: "Clinic booking app", brief: "Booking flow for three clinics in Pokhara, React + Supabase." })
  .select("id").single();
assert.equal(error, null);

// planner: owner only, saves the plan; wizard mode needs a real brief
assert.equal((await post("/api/projects/plan", freelancer.cookie, { project: project!.id })).status, 403);
assert.equal((await post("/api/projects/plan", other.cookie, { project: project!.id })).status, 404, "another client can't touch it");
assert.equal((await post("/api/projects/plan", client.cookie, { title: "x", brief: "y" })).status, 400);
const plan = await post("/api/projects/plan", client.cookie, { project: project!.id });
assert.equal(plan.status, 200, await plan.clone().text());
assert.equal((await plan.json()).plan.length, 3);
const wizardPlan = await (await post("/api/projects/plan", client.cookie, { title: "Landing page", brief: "A marketing site with a contact form.", budgetUsd: 1000 })).json();
assert.equal(wizardPlan.plan.reduce((a: number, m: { amountUsd: number }) => a + m.amountUsd, 0), 1000, "amounts add up to the budget");

// matcher: saves a shortlist (may be empty without backed freelancers)
const match = await post("/api/projects/match", client.cookie, { project: project!.id });
assert.equal(match.status, 200, await match.clone().text());
assert.ok(Array.isArray((await match.json()).candidates));

const detail = await page(`/client/projects/${project!.id}`, client.cookie);
assert.ok(detail.includes("MOCK milestone 1") && detail.includes("ACCEPTANCE CRITERIA"), "plan shown");
assert.ok((await page("/client/projects", client.cookie)).includes("Clinic booking app"));
assert.ok((await page(`/client/new?project=${project!.id}`, client.cookie)).includes("Clinic booking app"), "wizard prefilled");
assert.ok(!(await page("/client/projects", other.cookie)).includes("Clinic booking app"), "briefs are private");

// inbox: both sides see the thread, an outsider doesn't
const { data: convo } = await service.from("conversations").insert({ freelancer_user_id: freelancer.id, member_user_id: client.id }).select("id").single();
await service.from("messages").insert({ conversation_id: convo!.id, sender_user_id: client.id, body: "Hello from the client" });
assert.ok((await page(`/client/messages?c=${convo!.id}&p=${project!.id}`, client.cookie)).includes("Hello from the client"));
assert.ok((await page(`/freelancer/messages?c=${convo!.id}`, freelancer.cookie)).includes("Hello from the client"));
assert.ok(!(await page(`/client/messages?c=${convo!.id}`, other.cookie)).includes("Hello from the client"));
console.log("projects + messages: OK");
