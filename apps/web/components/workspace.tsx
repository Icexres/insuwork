import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import en from "@insuwork/shared/i18n/en.json";
import { short, viewer } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge, Icon, type IconName, Notice, initialsOf } from "./ui";
import { AccountMenu, MobileNav, type NavItem } from "./workspace-nav";

// Role workspace shell: left nav, sticky top bar, footer. No wallet code here — the
// adapter gets added only under /client, /voucher, /panel, /admin (AGENTS.md rule 1).

export type Role = keyof typeof en.shell.workspace;
type NavKey = keyof typeof en.shell.nav;

const NAV: Record<Role, [NavKey, string, IconName][]> = {
  freelancer: [
    ["home", "/freelancer/home", "layout-dashboard"],
    ["application", "/freelancer", "folder"],
    ["triage", "/freelancer/triage", "list-checks"],
  ],
  voucher: [
    ["dashboard", "/voucher/dashboard", "layout-dashboard"],
    ["applicants", "/voucher/applicants", "folder"],
    ["vault", "/voucher", "list-checks"],
  ],
  client: [
    ["freelancers", "/client/freelancers", "layout-dashboard"],
    ["newCommitment", "/client/new", "folder"],
    ["commitments", "/client/commitments", "list-checks"],
  ],
  panel: [["assignedClaims", "/panel", "layout-dashboard"]],
  admin: [
    ["configuration", "/admin", "layout-dashboard"],
    ["claimsQueue", "/admin/claims", "folder"],
    ["applications", "/admin/applications", "folder"],
    ["keeper", "/admin/keeper", "list-checks"],
  ],
};

const WALLET_ROLES: Role[] = ["voucher", "client", "panel", "admin"];

async function signOut() {
  "use server";
  await supabaseServer().auth.signOut();
  redirect("/");
}

export async function Workspace({
  role,
  active,
  crumb,
  counts,
  children,
}: {
  role: Role;
  active: string;
  /** Breadcrumb after the role, e.g. ["Applicants", "Rojina Lama"]. With two or more, the first links to `active`. */
  crumb: string[];
  /** Nav badges keyed by href, e.g. { "/panel": 2 } for claims awaiting a vote. */
  counts?: Record<string, number>;
  children: ReactNode;
}) {
  const s = en.shell;
  const v = await viewer();
  // the freelancer's own public profile (exists after MOCK KYC); other roles have none
  const ownRef = role === "freelancer" && v
    ? ((await supabaseServer().from("my_kyc").select("freelancer_ref").maybeSingle()).data?.freelancer_ref as string | undefined)
    : undefined;
  const wallet = v?.wallet && WALLET_ROLES.includes(role) ? short(v.wallet) : undefined;
  const notice = WALLET_ROLES.includes(role) ? s.devnetNotice : s.pilotNotice;
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const nav: NavItem[] = NAV[role].map(([key, href, icon]) => ({ href, icon, label: s.nav[key], on: href === active, count: counts?.[href] }));
  const initials = v ? initialsOf(v.name.includes("@") ? v.name.split("@")[0].replace(/[._-]+/g, " ") : v.name) : "?";
  const links = (
    <>
      {ownRef && <Link href={`/p/${ownRef}`} className="flex min-h-9 items-center px-3 text-xs text-muted hover:text-bright">{s.publicProfile}</Link>}
      <Link href="/how" className="flex min-h-9 items-center px-3 text-xs text-muted hover:text-bright">{s.help}</Link>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col justify-between gap-6 overflow-y-auto border-r-[0.5px] border-line bg-surface p-4 min-[900px]:flex">
        <div className="flex flex-col gap-6">
          <Link href="/" className="flex items-center gap-2.5 p-2 text-base font-medium text-bright">
            <Icon name="layers" size={22} />
            {en.app.name}
          </Link>
          <nav aria-label={s.workspace[role]} className="flex flex-col gap-0.5">
            <p className="mb-2 px-3 font-mono text-[11px] text-faint">{s.workspace[role]}</p>
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.on ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors duration-150 ${n.on ? "bg-raised text-bright" : "text-muted hover:text-bright"}`}
              >
                <Icon name={n.icon} className={n.on ? "" : "opacity-60"} />
                <span className="flex-1">{n.label}</span>
                {n.count ? (
                  <span className="min-w-[18px] rounded-full bg-accent px-[5px] text-center font-mono text-[10px] leading-[18px] text-canvas">{n.count}</span>
                ) : (
                  <span className={`size-1.5 rounded-full ${n.on ? "bg-accent" : ""}`} />
                )}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-0.5 border-t-[0.5px] border-line pt-4">{links}</div>
        </div>
        <div className="flex flex-col gap-4">
          <Notice title={notice.title}>{notice.body}</Notice>
          <div className="flex items-center gap-2.5 px-1">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-medium text-fg shadow-[inset_0_0_0_0.5px_theme(colors.edge)]">{initials}</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] text-fg">{v?.name ?? s.signedOut}</span>
              {v?.email && <span className="truncate text-[11px] text-faint">{v.email}</span>}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-3 border-b-[0.5px] border-line bg-canvas/[0.86] px-[clamp(16px,4vw,40px)] backdrop-blur-[14px]">
          <MobileNav
            label={s.workspace[role]}
            items={nav}
            home={<><Icon name="layers" size={22} />{en.app.name}</>}
            footer={<Notice title={notice.title}>{notice.body}</Notice>}
            labels={{ open: s.openNav, close: s.closeNav }}
          >
            {links}
          </MobileNav>
          <nav aria-label={s.breadcrumb} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[13px] text-muted">
            <span className="shrink-0">{s.crumb[role]}</span>
            {crumb.map((c, i) => {
              const last = i === crumb.length - 1;
              return (
                <span key={i} className={`flex items-center gap-2 ${last ? "min-w-0" : "shrink-0"}`}>
                  <span aria-hidden="true" className="text-edge">/</span>
                  {last ? (
                    <span aria-current="page" className="truncate text-fg">{c}</span>
                  ) : i === 0 ? (
                    <Link href={active} className="hover:text-bright">{c}</Link>
                  ) : (
                    <span>{c}</span>
                  )}
                </span>
              );
            })}
          </nav>
          {wallet && <span className="hidden shrink-0 font-mono text-[11px] text-muted sm:inline">{wallet}</span>}
          <Badge>{wallet ? s.envDevnet : s.envPilot}</Badge>
          {v && (
            <AccountMenu initials={initials} label={s.account}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm text-bright">{v.name}</span>
                {v.email && <span className="break-all text-xs text-muted">{v.email}</span>}
                <span className="font-mono text-[11px] text-faint">{wallet ? `${s.crumb[role].toUpperCase()} · ${wallet}` : s.workspace[role]}</span>
              </div>
              {ownRef && (
                <>
                  <div className="h-[0.5px] bg-line" />
                  <Link role="menuitem" href={`/p/${ownRef}`} className="-mx-2 -my-1 flex min-h-[34px] items-center rounded-md px-2 text-[13px] text-fg hover:bg-raised">{s.publicProfile}</Link>
                </>
              )}
              <div className="h-[0.5px] bg-line" />
              <form action={signOut}>
                <button role="menuitem" type="submit" className="flex min-h-[38px] w-full items-center justify-center rounded-lg bg-raised text-[13px] text-fg shadow-[inset_0_0_0_0.5px_theme(colors.edge)] hover:text-bright">
                  {en.auth.signOut}
                </button>
              </form>
            </AccountMenu>
          )}
        </header>
        <main className="flex flex-1 flex-col gap-7 px-[clamp(16px,4vw,40px)] pb-12 pt-[clamp(24px,4vw,40px)]">
          <div className="screen-enter flex min-w-0 flex-col gap-6">{children}</div>
          <footer className="mt-auto flex flex-wrap justify-between gap-x-4 gap-y-2 border-t-[0.5px] border-line pt-5 text-[11px] text-faint">
            <p>{s.footer}</p>
            <p className="font-mono">{today}</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
