"use client";

import Link from "next/link";
import { useState } from "react";
import type { Glance as GlanceData } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { Disclosure } from "./Disclosure";

type Tab = "menu" | "buy" | "away" | "out";

/** "Out/Unused" can break after the slash so four tabs fit a phone width. */
function tabName(label: string) {
  const slash = label.indexOf("/");
  if (slash === -1) return label;
  return <>{label.slice(0, slash + 1)}<wbr />{label.slice(slash + 1)}</>;
}

/** "At a glance": recipes the bar can make, and what to buy. Collapsed at the top of Stock. */
export function Glance({ data }: { data: GlanceData }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("menu");
  const label = (b: GlanceData["buy"][number]) =>
    `${cap(b.specs.join(" + "))}${b.with.length ? ` (with ${b.with.join(", ")})` : b.specs.length > 1 ? " (together)" : ""}`;
  const list = data.buy.map((b) => `- ${label(b)}: unlocks ${b.recipes.join(", ")}`).join("\n");
  const shareText = `Bar shopping list\n${list}`;
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Bar shopping list", text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* share sheet dismissed */
    }
  }
  const summary = [
    `${data.canMake.length} on the menu`,
    data.oneAway.length ? `${data.oneAway.length} one away` : null,
    data.buyItems ? `${data.buyItems} to buy` : null,
  ].filter(Boolean).join(" · ");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "menu", label: "On the Menu", count: data.canMake.length },
    { id: "buy", label: "To Buy", count: data.buyItems },
    { id: "away", label: "One Away", count: data.oneAway.length },
    { id: "out", label: "Out/Unused", count: data.unusedOut.length },
  ];

  return (
    <Disclosure className="a-glance" headClassName="a-glance-head" bodyClassName="a-glance-body" summary={
      <>
        <span className="a-glance-title">At a glance</span>
        <span className="a-glance-sum">{summary}</span>
      </>
    }>
      <div className="a-glance-tabs" role="tablist" aria-label="At a glance">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`glance-tab-${t.id}`}
            className="a-glance-tab"
            aria-selected={tab === t.id}
            aria-controls="glance-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            <span>{tabName(t.label)}</span>
            <span className="a-count">{t.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="glance-panel" aria-labelledby={`glance-tab-${tab}`}>
        {tab === "menu" ? (
          data.canMake.length === 0 ? <p className="a-quiet">Nothing is on the menu.</p> : (
            <ul className="a-plain">
              {data.canMake.map((r) => <li key={r.id}><Link href={`/admin/recipes/${r.id}`}>{r.name}</Link></li>)}
            </ul>
          )
        ) : null}
        {tab === "buy" ? (
          data.buy.length === 0 ? <p className="a-quiet">Nothing to buy. Every recipe can be made.</p> : (
            <>
              <ul className="a-plain">
                {data.buy.map((b) => (
                  <li key={b.specs.join("|")}>
                    <strong>{cap(b.specs.join(" + "))}</strong>
                    {b.with.length ? <span className="a-quiet"> (with {b.with.join(", ")})</span> : b.specs.length > 1 ? <span className="a-quiet"> (together)</span> : null}
                    <span className="a-quiet"> unlocks {b.recipes.length === 1 ? b.recipes[0] : `${b.recipes.length}: ${b.recipes.join(", ")}`}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="a-btn" onClick={share}>{copied ? "Copied" : "Copy / share list"}</button>
            </>
          )
        ) : null}
        {tab === "away" ? (
          data.oneAway.length === 0 ? <p className="a-quiet">No recipe is one ingredient away.</p> : (
            <ul className="a-plain">
              {data.oneAway.map((r) => (
                <li key={r.id}><Link href={`/admin/recipes/${r.id}`}>{r.name}</Link> <span className="a-quiet">needs {r.missing[0]}</span></li>
              ))}
            </ul>
          )
        ) : null}
        {tab === "out" ? (
          data.unusedOut.length === 0 ? <p className="a-quiet">Nothing is out and unused.</p> : (
            <ul className="a-plain a-quiet">
              {data.unusedOut.map((p) => <li key={p.id}><Link href={`/admin/bottles/${p.id}`}>{p.name}</Link></li>)}
            </ul>
          )
        ) : null}
      </div>
    </Disclosure>
  );
}
