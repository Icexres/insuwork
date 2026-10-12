import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { WalletBind, WalletProviders } from "./wallet";

/** Layout for wallet roles: providers + a bind prompt until the profile has a SIWS-verified wallet. */
export async function WalletLayout({ children }: { children: ReactNode }) {
  let bound = true;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = user ? await supabase.from("wallet_links").select("wallet").eq("user_id", user.id).maybeSingle() : { data: null };
    bound = !!data;
  }
  return (
    <WalletProviders>
      {!bound && <WalletBind />}
      {children}
    </WalletProviders>
  );
}
