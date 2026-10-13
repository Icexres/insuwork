import { redirect } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth-shell";

async function signOut() {
  "use server";
  await supabaseServer().auth.signOut();
  redirect("/");
}

// Deletes the signed-in user only (id comes from the session, never the form). FKs cascade (migration 0012).
async function deleteAccount() {
  "use server";
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabaseService().auth.admin.deleteUser(user.id);
  if (error) throw error;
  await supabase.auth.signOut();
  redirect("/");
}

export default async function Settings() {
  const t = en.settings;
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect("/login");
  return (
    <AuthShell title={t.title} subtitle={user.email ?? ""}>
      <div className="flex flex-col gap-6">
        <form action={signOut}>
          <button type="submit" className="flex min-h-[40px] w-full items-center justify-center rounded-lg bg-raised text-[13px] text-fg shadow-[inset_0_0_0_0.5px_theme(colors.edge)] hover:text-bright">
            {en.auth.signOut}
          </button>
        </form>
        <form action={deleteAccount} className="flex flex-col gap-3 rounded-lg border-[0.5px] border-red-500/30 p-4">
          <p className="text-sm font-medium text-bright">{t.deleteTitle}</p>
          <p className="text-[13px] text-muted">{t.deleteBody}</p>
          <label className="flex items-center gap-2 text-[13px] text-fg">
            <input type="checkbox" required /> {t.deleteConfirm}
          </label>
          <button type="submit" className="flex min-h-[40px] items-center justify-center rounded-lg bg-red-600 text-[13px] text-white hover:bg-red-500">
            {t.deleteButton}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
