import { timingSafeEqual } from "node:crypto";

/** Scheduled-job routes (keeper, indexer): `Authorization: Bearer $KEEPER_RUN_SECRET`, constant-time. */
export function cronAuthorized(req: Request) {
  const secret = process.env.KEEPER_RUN_SECRET ?? "";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return !!secret && got.length === want.length && timingSafeEqual(got, want);
}
