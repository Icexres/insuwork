// DB role (profiles.role) ↔ route prefix. The UI calls the panelist role "panel".
export type DbRole = "freelancer" | "family" | "voucher" | "client" | "panelist" | "admin";

export const HOME: Record<DbRole, string> = {
  freelancer: "/freelancer/home",
  family: "/family",
  voucher: "/voucher/dashboard",
  client: "/client/freelancers",
  panelist: "/panel",
  admin: "/admin",
};

export const PREFIX_ROLE: Record<string, DbRole> = {
  freelancer: "freelancer", family: "family", voucher: "voucher", client: "client", panel: "panelist", admin: "admin",
};

export const WALLET_ROLES: DbRole[] = ["voucher", "client", "panelist", "admin"];
export const SELF_SERVICE_ROLES = ["freelancer", "family", "client", "voucher"] as const;
