import { BarCard } from "@/components/admin/BarCard";
import { TvGameCard } from "@/components/admin/TvGameCard";
import { Tonight } from "@/components/admin/Tonight";
import { tonight } from "@/lib/night";

export const metadata = { title: "Bar" };

/** The Bar tab (route /admin/establishment), the bar-night page: Open/Closed, then tonight's knock and words. Usage and git live on System; At a glance is on Stock. */
export default async function EstablishmentPage() {
  const night = await tonight();
  return (
    <div className="a-establish">
      <BarCard />
      <TvGameCard />
      {night ? <Tonight night={night} /> : <p className="a-card a-quiet">Tonight&apos;s code needs a signing secret on the server.</p>}
    </div>
  );
}
