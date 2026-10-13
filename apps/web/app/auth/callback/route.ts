import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { HOME, type DbRole } from "@/lib/roles";

// Magic-link / Google OAuth landing: exchange the code, then go to the role home (or onboarding).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const supabase = supabaseServer();
  if (!code || (await supabase.auth.exchangeCodeForSession(code)).error) {
    return NextResponse.redirect(new URL("/login?error=1", url));
  }
  const { data: { user } } = await supabase.auth.getUser();
  let { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle();
  // Admin is server-granted (E-40): an email listed in ADMIN_EMAILS becomes admin on sign-in (the link/OAuth proved the email).
  const admins = (process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean);
  if (user!.email && admins.includes(user!.email.toLowerCase()) && profile?.role !== "admin") {
    const { error } = await supabaseService().from("profiles").upsert({ id: user!.id, role: "admin" });
    if (!error) profile = { role: "admin" };
  }
  const next = url.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : null;
  const dest = !profile ? "/onboarding" : safeNext ?? HOME[profile.role as DbRole];
  return NextResponse.redirect(new URL(dest, url));
}
