import { redirect } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { supabaseServer } from "@/lib/supabase/server";
import { HOME, SELF_SERVICE_ROLES } from "@/lib/roles";

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
    <main className="mx-auto mt-24 flex max-w-md flex-col gap-3 px-4">
      <h1 className="text-xl font-medium">{t.onboardingTitle}</h1>
      <form action={choose} className="flex flex-col gap-2">
        {SELF_SERVICE_ROLES.map((r) => (
          <button key={r} name="role" value={r} className="rounded border px-3 py-2 text-left">{t.roles[r]}</button>
        ))}
      </form>
    </main>
  );
}
