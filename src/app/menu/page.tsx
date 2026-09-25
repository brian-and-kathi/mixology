import Link from "next/link";
import { GlassIcon } from "@/components/GlassIcon";
import { PhoneShell } from "@/components/PhoneShell";
import { loadMenu, SECTIONS, type SectionId } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu" };

/** Phone guest menu: same sections and order as the TV, one tab per non-empty section. */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const menu = await loadMenu().catch(() => null);
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
          const body = (
            <>
              <GlassIcon glass={item.glass} />
              <span className="item-text">
                <span className="item-name">{item.name}</span>
                {item.detail ? <span className="item-detail">{item.detail}</span> : null}
              </span>
            </>
          );
          const two = item.detail ? " two-line" : "";
          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className={`card${two}`}>{body}</Link>
              ) : (
                // Cellar is information only: same card look as the other sections, but not a link.
                <div className={`card card-static${two}`}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </PhoneShell>
  );
}
