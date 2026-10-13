// DB role (profiles.role) ↔ route prefix. The UI calls the panelist role "panel".
export type DbRole = "freelancer" | "voucher" | "client" | "panelist" | "admin";

export const HOME: Record<DbRole, string> = {
  freelancer: "/freelancer/home",
  voucher: "/voucher/dashboard",
  client: "/client/freelancers",
  panelist: "/panel",
  admin: "/admin",
};

export const PREFIX_ROLE: Record<string, DbRole> = {
  freelancer: "freelancer", voucher: "voucher", client: "client", panel: "panelist", admin: "admin",
};

export const WALLET_ROLES: DbRole[] = ["voucher", "client", "panelist", "admin"];
export const SELF_SERVICE_ROLES = ["freelancer", "client", "voucher"] as const;
