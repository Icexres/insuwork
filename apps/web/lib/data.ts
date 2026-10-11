// Server-side reads for the role pages: the viewer (Supabase), live chain state (SDK), mirror lists (Supabase).
import { cache } from "react";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { connection, programs } from "@/lib/chain";
import type { DbRole } from "@/lib/roles";

const USDC = 1_000_000n;

/** USDC base units → "1,234.56" (integer math, no floats for money). */
export function usd(base: bigint | string | number | { toString(): string } | null | undefined) {
  const v = BigInt((base ?? 0).toString());
  const neg = v < 0n;
  const a = neg ? -v : v;
  const cents = ((a % USDC) / 10_000n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${(a / USDC).toLocaleString("en-US")}.${cents}`;
}
/** Whole USDC string from user input → base units, or null if invalid. */
export function parseUsd(s: string): bigint | null {
  const m = s.replace(/,/g, "").trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  return m ? BigInt(m[1]) * USDC + BigInt((m[2] ?? "").padEnd(6, "0")) : null;
}
export const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
export const pct = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 100n) / whole));

export type Viewer = { id: string; email: string; role: DbRole; name: string; wallet: string | null };

export const viewer = cache(async (): Promise<Viewer | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: link }] = await Promise.all([
    supabase.from("profiles").select("role, display_name").eq("id", user.id).maybeSingle(),
    supabase.from("wallet_links").select("wallet").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!profile) return null;
  return { id: user.id, email: user.email ?? "", role: profile.role as DbRole, name: profile.display_name ?? user.email ?? "", wallet: link?.wallet ?? null };
});

/** Protocol parameters read from the on-chain configs (never hard-coded). */
export const rules = cache(async () => {
  const p = programs();
  const [bond, escrow, disputes] = await Promise.all([
    p.bond.account.bondConfig.fetch(sdk.pdas.bondConfig()),
    p.escrow.account.escrowConfig.fetch(sdk.pdas.escrowConfig()),
    p.disputes.account.disputesConfig.fetch(sdk.pdas.disputesConfig()),
  ]);
  return {
    mint: bond.usdcMint.toBase58(),
    minBond: BigInt(bond.minBond.toString()),
    premiumBps: escrow.premiumBps,
    feeBps: escrow.platformFeeBps,
    claimWindowDays: escrow.claimWindowSecs.toNumber() / 86_400,
    rulingDays: disputes.rulingSecs.toNumber() / 86_400,
    claimFee: BigInt(disputes.claimFee.toString()),
  };
});

export async function usdcBalance(owner: string) {
  const { mint } = await rules();
  try {
    const b = await connection().getTokenAccountBalance(sdk.ata(new PublicKey(owner), new PublicKey(mint)));
    return BigInt(b.value.amount);
  } catch {
    return 0n; // no token account yet
  }
}

/** freelancer_ref → display names (server-only lookup through the MOCK partner link). */
export async function freelancerNames(refs: string[]) {
  if (!refs.length) return new Map<string, string>();
  const db = supabaseService();
  const { data: kyc } = await db.from("partner_kyc").select("freelancer_ref, freelancer_user_id").in("freelancer_ref", refs);
  const ids = (kyc ?? []).map((k) => k.freelancer_user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  return new Map((kyc ?? []).map((k) => [k.freelancer_ref, name.get(k.freelancer_user_id) ?? short(k.freelancer_ref)]));
}

// ── voucher ─────────────────────────────────────────────────────────
export async function voucherVault(wallet: string) {
  const p = programs();
  const vaultKey = sdk.pdas.vault(new PublicKey(wallet));
  const v = await p.bond.account.bondVault.fetchNullable(vaultKey);
  const db = supabaseService();
  const { data: backings } = await db.from("backings").select("*").eq("vault", vaultKey.toBase58()).eq("closed", false);
  const { data: commitments } = await db.from("commitments").select("pubkey, client, freelancer_ref, backings, status, released")
    .contains("vouchers", [wallet]);
  const names = await freelancerNames([...new Set((backings ?? []).map((b) => b.freelancer_ref))]);
  const big = (x: { toString(): string } | undefined) => BigInt((x ?? 0).toString());
  const deposited = big(v?.deposited), allocated = big(v?.allocated), locked = big(v?.locked);
  return {
    exists: !!v,
    address: vaultKey.toBase58(),
    deposited, allocated, locked, unallocated: deposited - allocated,
    premiums: big(v?.premiumsEarned), claimsPaid: big(v?.claimsPaid),
    backings: ((backings ?? []) as { pubkey: string; freelancer_ref: string; cap: string; locked: string; active_commitments: number }[]).map((b) => ({
      ...b,
      name: names.get(b.freelancer_ref) ?? short(b.freelancer_ref),
      commitments: ((commitments ?? []) as { pubkey: string; client: string; status: string; backings: string[] }[])
        .filter((c) => c.backings.includes(b.pubkey)),
    })),
  };
}

/** Ready applicants with their triage summary (vouchers can read ready/backed applications + reports via RLS). */
export async function readyApplicants() {
  const supabase = supabaseServer();
  const { data: apps } = await supabase.from("applications").select("id, freelancer_user_id, college, grad_year, skills, github_handle, status")
    .in("status", ["ready", "backed"]).order("created_at", { ascending: false });
  const ids = (apps ?? []).map((a) => a.id);
  const { data: reports } = ids.length ? await supabase.from("triage_reports").select("application_id, summary, report").in("application_id", ids) : { data: [] };
  const db = supabaseService();
  const userIds = (apps ?? []).map((a) => a.freelancer_user_id);
  const [{ data: profiles }, { data: kyc }] = userIds.length
    ? await Promise.all([
        db.from("profiles").select("id, display_name").in("id", userIds),
        db.from("partner_kyc").select("freelancer_user_id, freelancer_ref").in("freelancer_user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  return (apps ?? []).map((a) => ({
    ...a,
    name: (profiles ?? []).find((p) => p.id === a.freelancer_user_id)?.display_name ?? "—",
    freelancerRef: (kyc ?? []).find((k) => k.freelancer_user_id === a.freelancer_user_id)?.freelancer_ref ?? null,
    report: (reports ?? []).find((r) => r.application_id === a.id) ?? null,
  }));
}
