import { PhoneShell } from "@/components/PhoneShell";
import { isAdmin } from "@/lib/admin-guard";

export default async function NotFound() {
  const admin = await isAdmin();
  return (
    <PhoneShell admin={admin} title="Not on the menu" back={{ href: "/menu", label: "Menu" }}>
      <p className="quiet">That drink isn't available right now.</p>
    </PhoneShell>
  );
}
