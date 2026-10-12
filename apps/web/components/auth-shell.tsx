import Link from "next/link";
import type { ReactNode } from "react";
import en from "@insuwork/shared/i18n/en.json";
import { Icon } from "@/components/ui";

// Auth pages (/login, /onboarding): brand bar, faint accent glow, one centred 380px column.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas [background-image:radial-gradient(60rem_30rem_at_50%_-10%,rgb(228_242_34/0.05),transparent_70%)]">
      <header className="flex h-16 items-center justify-between px-6">
        <Link href="/" className="press flex items-center gap-2 text-[15px] font-medium text-bright"><Icon name="layers" size={20} />{en.app.name}</Link>
        <Link href="/" className="text-[13px] text-muted hover:text-bright motion-safe:transition-colors">{en.auth.back}</Link>
      </header>
      <main className="flex flex-1 items-center justify-center [padding:32px_20px_64px]">
        <div className="flex w-full max-w-[380px] flex-col gap-7">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-medium tracking-[-0.02em] text-bright">{title}</h1>
            <p className="text-sm leading-normal text-muted [text-wrap:pretty]">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Spinner({ dark = false }: { dark?: boolean }) {
  return <span aria-hidden className={`size-3.5 shrink-0 rounded-full border-2 motion-safe:animate-spin ${dark ? "border-canvas/20 border-t-canvas" : "border-white/15 border-t-bright"}`} />;
}
