import en from "@insuwork/shared/i18n/en.json";
import { RolePage } from "@/components/role-page";

export const metadata = { title: `${en.landing.nav.backers} · ${en.app.name}` };

export default function Page() {
  return <RolePage page="backers" />;
}
