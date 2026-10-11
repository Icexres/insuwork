// Shared helpers for the *.e2e.ts checks: a real Supabase session as an @supabase/ssr cookie.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

export const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const service = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const storageKey = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;

export async function signIn(role: string | null) {
  const email = `e2e-${role}-${Date.now()}@test.local`;
  const password = "e2e-password-1";
  const { data: created, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const user = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await user.auth.signInWithPassword({ email, password });
  // @supabase/ssr cookie format: "base64-" + base64url(session JSON), chunked at 3180 chars
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const chunks = value.match(/.{1,3180}/g)!;
  const cookie = chunks.length === 1 ? `${storageKey}=${value}` : chunks.map((c, i) => `${storageKey}.${i}=${c}`).join("; ");
  if (role === "panelist" || role === "admin") await service.from("profiles").insert({ id: created.user.id, role });
  else if (role) assert.equal((await user.from("profiles").insert({ id: created.user.id, role })).error, null);
  return { id: created.user.id, cookie };
}

export const get = async (path: string, cookie = "") => {
  const r = await fetch(APP + path, { headers: { cookie }, redirect: "manual" });
  return r.status === 200 ? "200" : new URL(r.headers.get("location")!, APP).pathname;
};
export const post = (path: string, cookie: string, body: object) =>
  fetch(APP + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });

