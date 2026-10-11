import Link from "next/link";
import type { ReactNode } from "react";
import en from "@insuwork/shared/i18n/en.json";
import { short, viewer } from "@/lib/data";
import { Badge, Divider, Icon, type IconName, Notice } from "./ui";

// Role workspace shell: left nav, top bar, footer. No wallet code here — the
// adapter gets added only under /client, /voucher, /panel, /admin (AGENTS.md rule 1).

export type Role = keyof typeof en.shell.workspace;
type NavKey = keyof typeof en.shell.nav;

const NAV: Record<Role, [NavKey, string, IconName][]> = {
  freelancer: [
    ["home", "/freelancer/home", "layout-dashboard"],
    ["application", "/freelancer", "folder"],
    ["triage", "/freelancer/triage", "list-checks"],
  ],
  family: [
    ["overview", "/family", "layout-dashboard"],
    ["statement", "/family/statement", "folder"],
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
    ["keeper", "/admin/keeper", "list-checks"],
  ],
};

const WALLET_ROLES: Role[] = ["voucher", "client", "panel", "admin"];

export async function Workspace({
  role,
  active,
  crumb,
  children,
}: {
  role: Role;
  active: string;
  /** Breadcrumb after the role, e.g. ["Applicants", "Rojina Lama"]. */
  crumb: string[];
  children: ReactNode;
}) {
  const s = en.shell;
  const v = await viewer();
  const wallet = v?.wallet && WALLET_ROLES.includes(role) ? short(v.wallet) : undefined;
  const notice = WALLET_ROLES.includes(role) ? s.devnetNotice : s.pilotNotice;
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[224px] shrink-0 flex-col justify-between overflow-y-auto border-r-[0.5px] border-line bg-surface p-4 md:flex">
        <div className="flex flex-col gap-7">
          <Link href="/" className="flex items-center gap-2.5 px-2 py-2.5 text-[17px] font-medium text-white">
            <Icon name="layers" size={25} />
            {en.app.name}
          </Link>
          <nav className="flex flex-col gap-2">
            <p className="font-mono text-[11px] text-muted">{s.workspace[role]}</p>
            {NAV[role].map(([key, href, icon]) => {
              const on = href === active;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-md p-3 text-[13px] ${on ? "bg-raised text-fg" : "text-muted hover:text-fg"}`}
                >
                  <Icon name={icon} />
                  <span className="flex-1">{s.nav[key]}</span>
                  {on && <span className="h-4 w-[3px] bg-fg" />}
                </Link>
              );
            })}
          </nav>
          <Divider />
          <div className="flex flex-col gap-4 text-xs text-muted">
            {/* ponytail: "Help" has no page yet. */}
            <Link href="/p/fr_7Kq2c9xA">{s.publicProfile}</Link>
            <span>{s.help}</span>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Notice title={notice.title}>{notice.body}</Notice>
          <Divider />
          <p className="text-[13px] text-fg">{v?.name ?? s.signedOut}</p>
          <p className="text-[11px] text-muted">{v?.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b-[0.5px] border-line px-6 md:px-10">
          <p className="truncate whitespace-pre text-[13px] text-muted">{[s.crumb[role], ...crumb].join("  /  ")}</p>
          <div className="flex items-center gap-4">
            <Badge>{wallet && WALLET_ROLES.includes(role) ? s.envDevnet : s.envPilot}</Badge>
            {wallet && <span className="hidden font-mono text-[11px] text-muted sm:inline">{wallet}</span>}
            <button type="button" aria-label={s.notifications}>
              <Icon name="bell" size={18} />
            </button>
            <button type="button" aria-label={s.helpLabel}>
              <Icon name="circle-help" size={18} />
            </button>
          </div>
        </header>
        <main className="flex flex-col gap-7 px-6 pb-14 pt-10 md:px-10">
          {children}
          <Divider />
          <footer className="flex flex-wrap justify-between gap-4 text-[11px] text-faint">
            <p>{role === "family" ? s.footerFamily : s.footer}</p>
            <p className="font-mono">{today}</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
