import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { newMockKyc } from "@insuwork/shared/src/mock-partner";

// POST { bankName, accountNumber } (freelancer) → MOCK KYC + freelancer_ref. Idempotent per freelancer.
// Never logs or stores the full account number.
export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "freelancer") return NextResponse.json({ error: "freelancers only" }, { status: 403 });

  const { data: existing } = await supabase.from("my_kyc").select("*").maybeSingle();
  if (existing) return NextResponse.json(existing);

  const { bankName, accountNumber } = await req.json().catch(() => ({}));
  let kyc;
  try {
    kyc = newMockKyc(String(bankName ?? ""), String(accountNumber ?? ""));
  } catch {
    return NextResponse.json({ error: "bank name and account number required" }, { status: 400 });
  }
  const { error } = await supabaseService().from("partner_kyc").insert({
    freelancer_user_id: user.id, kyc_id: kyc.kycId, salt: `\\x${kyc.salt.toString("hex")}`, freelancer_ref: kyc.freelancerRef,
    bank_name: kyc.bankName, account_masked: kyc.accountMasked, is_mock: true,
  });
  if (error) return NextResponse.json({ error: "kyc failed" }, { status: 500 });
  return NextResponse.json({ freelancer_ref: kyc.freelancerRef, bank_name: kyc.bankName, account_masked: kyc.accountMasked, is_mock: true });
}
