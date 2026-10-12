"use client";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AuthShell, Spinner } from "@/components/auth-shell";

// Passwordless: an emailed magic link or Google. Sign-in and sign-up are the same Supabase call (the
// first link creates the user); ?mode=signup only changes the copy. The role is picked at /onboarding.
const t = en.auth;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const press = "motion-safe:transition-[background-color,filter,transform] motion-safe:duration-150 motion-safe:ease-[var(--ease-out)] active:scale-[0.985] disabled:cursor-wait";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const up = params.get("mode") === "signup";
  const m = up ? t.signup : t.signin;
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "form" | null>(null);
  const [state, setState] = useState<"idle" | "sent" | "error">(params.get("error") ? "error" : "idle");
  const redirectTo = () => {
    const next = params.get("next");
    return `${location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const bad = !email.trim() ? t.emailRequired : !EMAIL.test(email.trim()) ? t.emailInvalid : null;
    setInvalid(bad);
    if (bad) return;
    setBusy("form");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setBusy(null);
    setState(error ? "error" : "sent");
  };
  const google = async () => {
    if (busy) return;
    setBusy("google");
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) { setBusy(null); setState("error"); } // on success the browser is already leaving
  };
  const switchMode = () => {
    const q = new URLSearchParams(params);
    if (up) q.delete("mode"); else q.set("mode", "signup");
    q.delete("error");
    setState("idle");
    setInvalid(null);
    const qs = q.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  };

  return (
    <AuthShell title={m.title} subtitle={m.subtitle}>
      {state === "sent" ? (
        <div role="status" className="flex flex-col items-center gap-4 rounded-xl border-[0.5px] border-white/[0.08] bg-surface px-6 py-7 text-center">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-accent/[0.12] text-accent">✓</span>
          <p className="text-sm leading-[1.55] text-fg [text-wrap:pretty]">{t.linkSent.replace("{email}", email.trim())}</p>
          <button type="button" onClick={() => setState("idle")} className="press text-[13px] text-muted hover:text-bright">{t.differentEmail}</button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {state === "error" && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2.5 text-center text-[13px] text-danger">{t.error}</p>}
          <button type="button" onClick={google} disabled={!!busy}
            className={`flex h-[42px] w-full items-center justify-center gap-2.5 rounded-lg border-[0.5px] border-white/[0.12] bg-[#141516] text-sm font-medium text-bright hover:bg-[#1a1b1d] ${press}`}>
            {busy === "google" ? <Spinner /> : <GoogleMark />}
            {m.google}
          </button>
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.06em] text-faint">
            <span className="h-[0.5px] flex-1 bg-white/[0.08]" />{t.or}<span className="h-[0.5px] flex-1 bg-white/[0.08]" />
          </div>
          <form onSubmit={sendLink} noValidate className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[13px] text-fg">{t.emailLabel}</span>
              <input type="email" value={email} autoComplete="email" placeholder={t.emailPlaceholder}
                aria-invalid={!!invalid} aria-describedby={invalid ? "email-error" : undefined}
                onChange={(e) => { setEmail(e.target.value); setInvalid(null); }}
                className="h-10 rounded-lg border-[0.5px] border-white/10 bg-surface px-3 text-sm text-bright placeholder:text-faint focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent/60 aria-[invalid=true]:border-danger/70 motion-safe:transition-colors" />
              {invalid && <span id="email-error" className="text-xs text-danger">{invalid}</span>}
            </label>
            <button type="submit" disabled={!!busy}
              className={`mt-1 flex h-[42px] items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-canvas hover:brightness-[1.06] ${press}`}>
              {busy === "form" && <Spinner dark />}
              {busy === "form" ? m.busy : m.submit}
            </button>
          </form>
          {up && <p className="text-center text-xs leading-[1.55] text-faint [text-wrap:pretty]">{t.signup.note}</p>}
        </div>
      )}
      <div className="flex justify-center gap-1.5 border-t-[0.5px] border-white/[0.06] pt-5 text-[13px] text-muted">
        {m.prompt}
        <button type="button" onClick={switchMode} className="press font-medium text-bright hover:text-accent">{m.switch}</button>
      </div>
    </AuthShell>
  );
}

export default function Login() {
  return <Suspense><LoginForm /></Suspense>;
}
