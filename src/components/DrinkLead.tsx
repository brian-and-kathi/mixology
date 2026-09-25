import { GlassIcon } from "@/components/GlassIcon";
import { RatingScore } from "@/components/Rating";
import type { Rating, RatingKind } from "@/lib/ratings";

/** Detail-page lead: the glass, with the guests' score ("4.2 ★") directly beneath it. */
export function DrinkLead({ glass, kind, id, rating }: { glass: string; kind: RatingKind; id: string; rating: Rating }) {
  return (
    <div className="lead">
      <GlassIcon glass={glass} className="glass-lg" />
      <RatingScore kind={kind} id={id} initial={rating} />
    </div>
  );
}
