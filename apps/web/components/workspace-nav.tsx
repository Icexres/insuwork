"use client";
// Interactive bits of the workspace shell: the phone nav drawer and the account menu. No wallet code (rule 1).
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui";

export type NavItem = { href: string; icon: IconName; label: string; on: boolean; count?: number };

/** Hamburger + slide-in drawer below 900px. Closes on route change, Escape and backdrop tap. */
export function MobileNav({ label, items, home, footer, labels, children }: {
  label: string; items: NavItem[]; home: ReactNode; footer: ReactNode; labels: { open: string; close: string }; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.documentElement.style.overflow = "hidden";
    addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={labels.open} aria-expanded={open}
        className="-ml-2.5 flex size-10 shrink-0 flex-col items-center justify-center gap-[5px] rounded-lg min-[900px]:hidden">
        <span className="h-[1.5px] w-4 bg-fg" />
        <span className="h-[1.5px] w-4 bg-fg" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex min-[900px]:hidden">
          <button type="button" aria-label={labels.close} onClick={() => setOpen(false)} className="drawer-fade absolute inset-0 bg-black/60" />
          <nav aria-label={label} className="drawer-in relative flex h-full w-[min(300px,85vw)] flex-col gap-5 overflow-y-auto border-r-[0.5px] border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5 p-2 text-base font-medium text-bright">{home}</Link>
              <button type="button" onClick={() => setOpen(false)} aria-label={labels.close} className="size-10 rounded-lg text-xl text-muted hover:text-bright">×</button>
            </div>
            <p className="px-3 font-mono text-[11px] text-faint">{label}</p>
            <div className="flex flex-col gap-0.5">
              {items.map((n) => (
                <Link key={n.href} href={n.href} aria-current={n.on ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] ${n.on ? "bg-raised text-bright" : "text-muted"}`}>
                  <Icon name={n.icon} className={n.on ? "" : "opacity-60"} />
                  <span className="flex-1">{n.label}</span>
                  {!!n.count && <span className="min-w-[18px] rounded-full bg-accent px-[5px] text-center font-mono text-[10px] leading-[18px] text-canvas">{n.count}</span>}
                </Link>
              ))}
            </div>
            {children && <div className="flex flex-col gap-0.5 border-t-[0.5px] border-line pt-4">{children}</div>}
            <div className="mt-auto">{footer}</div>
          </nav>
        </div>
      )}
    </>
  );
}

/** Avatar button + popover. Closes on outside pointer-down and Escape. */
export function AccountMenu({ initials, label, children }: { initials: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={label}
        className="flex size-9 items-center justify-center rounded-full bg-raised text-xs font-medium text-fg shadow-[inset_0_0_0_0.5px_theme(colors.edge)] transition-shadow hover:shadow-[inset_0_0_0_0.5px_theme(colors.muted)]">
        {initials}
      </button>
      {open && (
        <div role="menu" className="menu-in absolute right-0 top-11 z-40 flex w-[min(280px,calc(100vw-32px))] flex-col gap-3 rounded-xl border-[0.5px] border-edge bg-surface p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
          {children}
        </div>
      )}
    </div>
  );
}
