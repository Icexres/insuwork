"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { supabaseBrowser } from "@/lib/supabase/browser";

function LoginForm() {
  const t = en.auth;
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">(params.get("error") ? "error" : "idle");
  const redirectTo = () => {
    const next = params.get("next");
    return `${location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setState(error ? "error" : "sent");
  };
  const google = () => supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });

  return (
    <main className="mx-auto mt-24 flex max-w-sm flex-col gap-4 px-4">
      <h1 className="text-xl font-medium">{t.signInTitle}</h1>
      <form onSubmit={sendLink} className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm">{t.emailLabel}</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder} className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">{t.sendLink}</button>
      </form>
      <p className="text-center text-sm">{t.or}</p>
      <button type="button" onClick={google} className="rounded border px-3 py-2">{t.google}</button>
      {state === "sent" && <p role="status">{t.linkSent}</p>}
      {state === "error" && <p role="alert">{t.error}</p>}
    </main>
  );
}

export default function Login() {
  return <Suspense><LoginForm /></Suspense>;
}
