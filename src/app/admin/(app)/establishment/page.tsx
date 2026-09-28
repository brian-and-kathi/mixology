import { BarCard } from "@/components/admin/BarCard";
import { Tonight } from "@/components/admin/Tonight";
import { tonight } from "@/lib/night";

export const metadata = { title: "Establishment" };

/** The bar-night page: Open/Closed, then tonight's knock and words. Usage, git and the glance live on System. */
export default async function EstablishmentPage() {
  const night = await tonight();
  return (
    <div className="a-establish">
      <BarCard />
      {night ? <Tonight night={night} /> : <p className="a-card a-quiet">Tonight&apos;s code needs a signing secret on the server.</p>}
    </div>
  );
}
