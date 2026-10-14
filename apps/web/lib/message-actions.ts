"use server";
// E-59 direct messages. Conversations are opened only by a client or backer, only with a freelancer who applied
// for backing (application ready/backed). Messages are written as the signed-in user, so RLS checks membership.
import { redirect } from "next/navigation";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { viewer } from "@/lib/data";

/** form: ref (freelancer_ref) or user (freelancer user id); optional project (prefills a first message). */
export async function startConversation(form: FormData) {
  const v = await viewer();
  if (v?.role !== "client" && v?.role !== "voucher") throw new Error("clients and backers only");
  const db = supabaseService();
  const ref = String(form.get("ref") ?? ""), user = String(form.get("user") ?? "");
  const uid = /^[0-9a-f-]{36}$/.test(user) ? user
    : /^[0-9a-f]{64}$/.test(ref) ? (await db.from("partner_kyc").select("freelancer_user_id").eq("freelancer_ref", ref).maybeSingle()).data?.freelancer_user_id
    : null;
  const { data: app } = uid
    ? await db.from("applications").select("id").eq("freelancer_user_id", uid).in("status", ["ready", "backed"]).maybeSingle()
    : { data: null };
  if (!app) throw new Error("this freelancer has not applied for backing");
  const pair = { freelancer_user_id: uid, member_user_id: v.id };
  await db.from("conversations").upsert(pair, { onConflict: "freelancer_user_id,member_user_id", ignoreDuplicates: true });
  const { data: c } = await db.from("conversations").select("id").match(pair).single();
  const project = String(form.get("project") ?? "");
  redirect(`/${v.role}/messages?c=${c!.id}${/^[0-9a-f-]{36}$/.test(project) ? `&p=${project}` : ""}`);
}

export async function sendMessage(conversation: string, body: string): Promise<{ error?: string }> {
  const v = await viewer();
  if (!v) return { error: "signed out" };
  const text = body.trim().slice(0, 2000);
  if (!text) return {};
  const { error } = await supabaseServer().from("messages").insert({ conversation_id: conversation, body: text });
  return error ? { error: error.message } : {};
}
