import Link from "next/link";
import type { CSSProperties } from "react";
import { GlassIcon, glassFootDrop } from "@/components/GlassIcon";
import { PhoneShell } from "@/components/PhoneShell";
import { loadMenu, SECTIONS, type SectionId } from "@/lib/menu";
import { ratingKey } from "@/lib/rating-key";
import { loadAllRatings } from "@/lib/ratings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu" };

/** Phone guest menu: same sections and order as the TV, one tab per non-empty section. */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  // Guest ratings, the TV board's single query and rounding; a failure just shows no ratings.
  const [menu, ratings] = await Promise.all([loadMenu().catch(() => null), loadAllRatings().catch((): Record<string, number> => ({}))]);
  if (!menu) {
    return (
      <PhoneShell>
        <p className="notice">The menu can't be loaded right now. Try again in a minute.</p>
      </PhoneShell>
    );
  }
  const tabs = SECTIONS.filter((s) => menu[s.id].length > 0);
  if (tabs.length === 0) {
    return (
      <PhoneShell>
        <p className="notice">Nothing available tonight.</p>
      </PhoneShell>
    );
  }
  const current: SectionId = tabs.find((t) => t.id === tab)?.id ?? tabs[0].id;

  return (
    <PhoneShell>
      <nav className="tabs" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((t) => (
          <Link key={t.id} href={`/menu?tab=${t.id}`} className={t.id === current ? "tab active" : "tab"} aria-current={t.id === current ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <ul className="cards">
        {menu[current].map((item) => {
          // Every section has a muted second line (ingredients, region · ABV, region · style) when there is data for it.
          const rating = ratings[ratingKey(current, item.id)];
          // Taller glasses (highball, collins) end lower: move the rating down by the difference so it clears the foot.
          const drop = rating != null ? glassFootDrop(item.glass) : 0;
          const body = (
            <>
              {/* Glass, and under it the guests' average ("4.2 ★", as on the TV board). Out of flow: same card height, same column. */}
              <span className="card-lead" style={drop ? ({ "--card-rating-drop": `${drop}rem` } as CSSProperties) : undefined}>
                <GlassIcon glass={item.glass} />
                {rating != null ? (
                  <span className="card-rating" role="img" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
                    <span className="card-rating-num">{rating.toFixed(1)}</span>
                    <span className="card-rating-star" aria-hidden>★</span>
                  </span>
                ) : null}
              </span>
              <span className="item-text">
                <span className="item-name">
                  {/* Pours: an invisible copy of the badge floated at the right of the name's first line keeps the room
                      the corner badge takes, plus 8px, so the name wraps before it and never runs under it. */}
                  {item.spec ? <span className="spec-badge badge-reserve" aria-hidden>{item.spec}</span> : null}
                  {item.name}
                </span>
                {item.detail ? <span className="item-detail">{keepHyphens(item.detail)}</span> : null}
              </span>
              {/* Pours: the type badge as a tab in the card's top-right corner, out of flow. */}
              {item.spec ? <span className="spec-badge corner-badge">{item.spec}</span> : null}
            </>
          );
          const two = (item.detail ? " two-line" : "") + (item.spec ? " has-badge" : "");
          return (
            // Pours: a little extra space above the first bottle of each spirit family (lib/spirit-family.ts).
            <li key={item.id} className={item.famStart ? "fam-start" : undefined}>
              {item.href ? (
                <Link href={item.href} className={`card${two}`}>{body}</Link>
              ) : (
                // Every section links to a detail page now (Cellar wines: /wine/:id); kept for items without one.
                <div className={`card card-static${two}`}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </PhoneShell>
  );
}

/**
 * Browsers may wrap after a hyphen ("semi-" / "dry"). Words that are kept whole with no-break spaces
 * (see lib/menu.ts) are wrapped in a nowrap span when they contain one, so lines still only break at " · ".
 */
function keepHyphens(text: string) {
  const parts = text.split(/([^ ]*-[^ ]*)/);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (i % 2 ? <span key={i} className="nobr">{part}</span> : part));
}
