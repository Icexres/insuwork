import { redirect } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { supabaseServer } from "@/lib/supabase/server";
import { HOME, SELF_SERVICE_ROLES } from "@/lib/roles";
import { AuthShell } from "@/components/auth-shell";

// First sign-in: pick a self-service role. RLS rejects anything else (panelist/admin are server-granted).
async function choose(form: FormData) {
  "use server";
  const role = String(form.get("role"));
  if (!(SELF_SERVICE_ROLES as readonly string[]).includes(role)) return;
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").insert({ id: user.id, role });
  if (error && error.code !== "23505") throw error; // 23505: already onboarded
  redirect(HOME[role as keyof typeof HOME]);
}

export default function Onboarding() {
  const t = en.auth;
  return (
    <AuthShell title={t.onboardingTitle} subtitle={t.onboardingSubtitle}>
      <form action={choose} className="flex flex-col gap-2">
        {SELF_SERVICE_ROLES.map((r) => (
          <button key={r} name="role" value={r}
            className="group flex items-center gap-3 rounded-lg border-[0.5px] border-white/10 bg-surface px-4 py-3 text-left hover:border-white/20 hover:bg-[#141516] active:scale-[0.985] motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-bright">{t.roles[r].title}</span>
              <span className="text-[13px] text-muted">{t.roles[r].body}</span>
            </span>
            <span aria-hidden className="text-muted group-hover:text-bright motion-safe:transition-[color,transform] motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5">→</span>
          </button>
        ))}
      </form>
    </AuthShell>
  );
}
