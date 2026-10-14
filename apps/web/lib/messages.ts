// E-59 inbox reads. Conversations and messages through the user's client (RLS: participants only);
// the other party's name/role through the service client (profiles are own-row only).
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/data";

export type Msg = { id: number; sender_user_id: string; body: string; created_at: string };

export async function inbox(v: Viewer, selected?: string) {
  const sb = supabaseServer();
  const { data: convs } = await sb.from("conversations").select("id, freelancer_user_id, member_user_id, created_at");
  const list = convs ?? [];
  const ids = list.map((c) => c.id);
  // ponytail: previews come from the 300 newest messages across the inbox; per-conversation query if inboxes get big
  const { data: recent } = ids.length
    ? await sb.from("messages").select("conversation_id, body, sender_user_id, created_at").in("conversation_id", ids).order("id", { ascending: false }).limit(300)
    : { data: [] };
  const otherOf = (c: (typeof list)[number]) => (c.freelancer_user_id === v.id ? c.member_user_id : c.freelancer_user_id) as string;
  const { data: people } = list.length
    ? await supabaseService().from("profiles").select("id, display_name, role").in("id", list.map(otherOf))
    : { data: [] };
  const rows = list.map((c) => {
    const p = (people ?? []).find((x) => x.id === otherOf(c));
    const last = (recent ?? []).find((m) => m.conversation_id === c.id);
    return {
      id: c.id as string, name: (p?.display_name as string | null) ?? "—", role: (p?.role ?? "freelancer") as "client" | "voucher" | "freelancer",
      last: last ? { body: last.body as string, mine: last.sender_user_id === v.id } : null, at: (last?.created_at ?? c.created_at) as string,
    };
  }).sort((a, b) => b.at.localeCompare(a.at));
  const active = rows.find((r) => r.id === selected) ?? null;
  const { data: thread } = active
    ? await sb.from("messages").select("id, sender_user_id, body, created_at").eq("conversation_id", active.id).order("id", { ascending: false }).limit(200)
    : { data: [] };
  return { rows, active, thread: ((thread ?? []) as Msg[]).reverse() };
}
