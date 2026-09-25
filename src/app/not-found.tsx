import { PhoneShell } from "@/components/PhoneShell";

export default function NotFound() {
  return (
    <PhoneShell title="Not on the menu" back={{ href: "/menu", label: "Menu" }}>
      <p className="quiet">That drink isn't available right now.</p>
    </PhoneShell>
  );
}
