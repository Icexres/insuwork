import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { HOME, PREFIX_ROLE, type DbRole } from "@/lib/roles";

// T-21: refresh the Supabase session and keep each role inside its own routes.
// ponytail: without NEXT_PUBLIC_SUPABASE_URL the guard is off so the demo UI still browses without a backend.
export async function middleware(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  const seg = req.nextUrl.pathname.split("/")[1];
  const needed = PREFIX_ROLE[seg];
  // a signed-in user opening /login goes straight back to their workspace
  if (!needed && !(seg === "login" && user)) return res;
  const to = (path: string) => {
    const r = NextResponse.redirect(new URL(path, req.url));
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  if (!user) return to(`/login?next=${encodeURIComponent(req.nextUrl.pathname)}`);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) return to("/onboarding");
  if (profile.role !== needed) return to(HOME[profile.role as DbRole]);
  return res;
}

export const config = { matcher: ["/((?!_next/|api/|icons/|favicon).*)"] };
