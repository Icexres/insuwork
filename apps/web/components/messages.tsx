import Link from "next/link";
import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Notice, PageHeading, Panel, initialsOf } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { Composer } from "@/components/chat";
import { fmt } from "@/lib/demo";
import { viewer } from "@/lib/data";
import { inbox } from "@/lib/messages";
import { myProject } from "@/lib/projects";

// E-59 inbox for clients, backers and freelancers. No wallet code (the freelancer page renders it, rule 1).
const EYEBROW = { client: "CLIENT", voucher: "BACKER", freelancer: "FREELANCER" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export async function MessagesPage({ role, c, p }: { role: "client" | "voucher" | "freelancer"; c?: string; p?: string }) {
  const t = en.messages;
  const v = await viewer();
  if (!v) return null;
  const side = role === "freelancer" ? "freelancer" : "member";
  const { rows, active, thread } = await inbox(v, c);
  // a client arriving from a project shortlist gets an editable first message carrying the brief
  const project = role === "client" && p && active && !thread.length ? await myProject(p) : null;
  const draft = project && active
    ? fmt(t.draft, { name: active.name.split(" ")[0], title: project.title, brief: project.brief.slice(0, 600) })
    : "";
  const base = `/${role}/messages`;

  return (
    <Workspace role={role} active={base} crumb={active ? [t.title, active.name] : [t.title]}>
      <PageHeading eyebrow={fmt(t.eyebrow, { role: EYEBROW[role] })} title={t.title} subtitle={t.subtitle[side]} />
      {rows.length === 0 ? (
        <Panel dashed><p className="text-sm text-fg">{t.none[side]}</p></Panel>
      ) : (
        <div className="grid overflow-hidden rounded-xl border-[0.5px] border-line bg-surface md:grid-cols-[17rem_minmax(0,1fr)]">
          <nav aria-label={t.title} className={`flex min-w-0 flex-col md:border-r-[0.5px] md:border-line ${active ? "max-md:hidden" : ""}`}>
            {rows.map((r) => (
              <Link key={r.id} href={`${base}?c=${r.id}`} aria-current={r.id === active?.id ? "page" : undefined}
                className={`flex min-w-0 items-center gap-3 border-b-[0.5px] border-line px-4 py-3 transition-colors ${r.id === active?.id ? "bg-raised" : "hover:bg-[#121314]"}`}>
                <Avatar initials={initialsOf(r.name)} size={34} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-bright">{r.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-faint">{t.roles[r.role]}</span>
                  </span>
                  <span className="truncate text-xs text-muted">{r.last ? `${r.last.mine ? `${t.you}: ` : ""}${r.last.body}` : t.empty}</span>
                </span>
              </Link>
            ))}
          </nav>
          {active ? (
            <section aria-label={active.name} className="flex min-w-0 flex-col">
              <header className="flex items-center gap-3 border-b-[0.5px] border-line px-4 py-3">
                <Link href={base} className="text-[13px] text-muted hover:text-bright md:hidden">{t.back}</Link>
                <span className="truncate text-sm font-medium text-bright">{active.name}</span>
                <span className="font-mono text-[10px] text-faint">{t.roles[active.role]}</span>
              </header>
              {/* column-reverse keeps the newest message in view without scroll scripts */}
              <div className="flex max-h-[60vh] min-h-[18rem] flex-col-reverse overflow-y-auto px-4 py-4">
                <ol className="flex flex-col gap-2.5">
                  {thread.length === 0 && <li className="py-8 text-center text-[13px] text-muted">{t.empty}</li>}
                  {thread.map((m) => {
                    const mine = m.sender_user_id === v.id;
                    return (
                      <li key={m.id} className={`flex max-w-[min(34rem,85%)] flex-col gap-1 ${mine ? "self-end items-end" : "self-start"}`}>
                        <p className={`whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? "bg-raised text-bright" : "bg-canvas text-fg shadow-[inset_0_0_0_0.5px_theme(colors.line)]"}`}>{m.body}</p>
                        <span className="font-mono text-[10px] text-faint">{when(m.created_at)}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <Composer key={active.id} conversation={active.id} draft={draft} />
            </section>
          ) : (
            <p className="flex items-center justify-center p-8 text-[13px] text-muted max-md:hidden">{t.pick}</p>
          )}
        </div>
      )}
      <Notice title={t.safety[side]} />
    </Workspace>
  );
}
