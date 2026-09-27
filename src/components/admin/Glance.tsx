"use client";

import Link from "next/link";
import { useState } from "react";
import type { Glance as GlanceData } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { Disclosure } from "./Disclosure";

/** "At a glance": recipes the bar can make, and what to buy. Lives on Establishment. */
export function Glance({ data }: { data: GlanceData }) {
  const [copied, setCopied] = useState(false);
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

  return (
    <Disclosure className="a-glance" headClassName="a-glance-head" bodyClassName="a-glance-body" summary={
      <>
        <span className="a-glance-title">At a glance</span>
        <span className="a-glance-sum">{summary}</span>
      </>
    }>
        <Disclosure className="a-glance-sec" defaultOpen summary={<>On the menu <span className="a-count">{data.canMake.length}</span></>}>
          <ul className="a-plain">
            {data.canMake.map((r) => <li key={r.id}><Link href={`/admin/recipes/${r.id}`}>{r.name}</Link></li>)}
          </ul>
        </Disclosure>
        <Disclosure className="a-glance-sec" defaultOpen summary={<>To buy <span className="a-count">{data.buyItems}</span></>}>
          {data.buy.length === 0 ? <p className="a-quiet">Nothing to buy. Every recipe can be made.</p> : (
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
          )}
        </Disclosure>
        <Disclosure className="a-glance-sec" defaultOpen={data.oneAway.length > 0} summary={<>One away <span className="a-count">{data.oneAway.length}</span></>}>
          <ul className="a-plain">
            {data.oneAway.map((r) => (
              <li key={r.id}><Link href={`/admin/recipes/${r.id}`}>{r.name}</Link> <span className="a-quiet">needs {r.missing[0]}</span></li>
            ))}
          </ul>
        </Disclosure>
        <Disclosure className="a-glance-sec" summary={<>Out, and no recipe uses them <span className="a-count">{data.unusedOut.length}</span></>}>
          <ul className="a-plain a-quiet">
            {data.unusedOut.map((p) => <li key={p.id}><Link href={`/admin/bottles/${p.id}`}>{p.name}</Link></li>)}
          </ul>
        </Disclosure>
    </Disclosure>
  );
}
