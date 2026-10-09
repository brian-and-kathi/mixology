"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/components/admin/api";
import type { Glance as GlanceData } from "@/lib/admin-data";
import { cap } from "@/lib/format";
import { shopKey } from "@/lib/shop-label";
import type { ShopItem } from "@/lib/shopping";
import { Chevron } from "./Disclosure";

type Tab = "buy" | "away" | "out";

/** "Out/Unused" can break after the slash so the tabs fit a phone width. */
function tabName(label: string) {
  const slash = label.indexOf("/");
  if (slash === -1) return label;
  return <>{label.slice(0, slash + 1)}<wbr />{label.slice(slash + 1)}</>;
}

/** The words written onto the shopping list: the ingredient line, without the "(with …)" note. */
function buyName(b: GlanceData["buy"][number]) {
  return cap(b.specs.join(" + "));
}

/** "At a glance": what to buy, what is one away, and what is out and unused. Collapsed at the top of Stock. */
export function Glance({ data, shop }: { data: GlanceData; shop: ShopItem[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("buy");
  const [shopItems, setShopItems] = useState(shop);
  const [shopError, setShopError] = useState<string | null>(null);
  const shopRef = useRef(shop);
  const seq = useRef(0);
  const tail = useRef(Promise.resolve());
  const label = (b: GlanceData["buy"][number]) =>
    `${buyName(b)}${b.with.length ? ` (with ${b.with.join(", ")})` : b.specs.length > 1 ? " (together)" : ""}`;
  const onList = (name: string) => shopItems.some((item) => shopKey(item.label) === shopKey(name));

  function showShop(next: ShopItem[]) {
    shopRef.current = next;
    setShopItems(next);
  }

  /** One save at a time, so a second tap cannot be overwritten by the first reply. */
  function toggleShop(name: string) {
    const key = shopKey(name);
    const n = ++seq.current;
    const before = shopRef.current;
    const already = before.some((item) => shopKey(item.label) === key);
    setShopError(null);
    showShop(already
      ? before.filter((item) => shopKey(item.label) !== key)
      : [...before, { id: `pending-${n}`, label: name, done: false }]);
    const work = async () => {
      try {
        const saved = await api<{ items: ShopItem[] }>("/api/admin/shopping", "POST", already ? { label: name, remove: true } : { label: name });
        if (n === seq.current) showShop(saved.items);
      } catch (e) {
        if (n !== seq.current) return;
        showShop(before);
        setShopError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      }
    };
    const run = tail.current.then(work, work);
    tail.current = run.then(() => {}, () => {});
  }
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
    { id: "buy", label: "To Buy", count: data.buyItems },
    { id: "away", label: "One Away", count: data.oneAway.length },
    { id: "out", label: "Out/Unused", count: data.unusedOut.length },
  ];

  return (
    <div className={open ? "a-disc a-glance is-open" : "a-disc a-glance"}>
      {/* Title and tabs stick together while the open list scrolls, and let go at the bottom of this card. */}
      <div className="a-glance-stick">
        <button type="button" className="a-disc-head a-glance-head" aria-expanded={open} aria-controls="glance-body" onClick={() => setOpen((v) => !v)}>
          <Chevron open={open} />
          <span className="a-disc-label">
            <span className="a-glance-title">At a glance</span>
            <span className="a-glance-sum">{summary}</span>
          </span>
        </button>
        <div className="a-glance-tabs" role="tablist" aria-label="At a glance" hidden={!open}>
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
      </div>
      <div id="glance-body" className="a-glance-body" hidden={!open}>
        <div role="tabpanel" id="glance-panel" aria-labelledby={`glance-tab-${tab}`}>
        {tab === "buy" ? (
          data.buy.length === 0 ? <p className="a-quiet">Nothing to buy. Every recipe can be made.</p> : (
            <>
              <ul className="a-plain a-glance-rows">
                {data.buy.map((b) => {
                  const name = buyName(b);
                  const listed = onList(name);
                  return (
                    <li key={b.specs.join("|")}>
                      <span className="a-glance-copy">
                        <strong>{name}</strong>
                        {b.with.length ? <span className="a-quiet"> (with {b.with.join(", ")})</span> : b.specs.length > 1 ? <span className="a-quiet"> (together)</span> : null}
                        <span className="a-quiet"> unlocks {b.recipes.length === 1 ? b.recipes[0] : `${b.recipes.length}: ${b.recipes.join(", ")}`}</span>
                      </span>
                      <button
                        type="button"
                        className={listed ? "a-btn a-glance-add is-on" : "a-btn a-glance-add"}
                        aria-pressed={listed}
                        aria-label={listed ? `Remove ${name} from the shopping list` : `Add ${name} to the shopping list`}
                        onClick={() => toggleShop(name)}
                      >
                        {listed ? "Remove" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {shopError ? <p className="a-error" role="alert">{shopError}</p> : null}
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
      </div>
    </div>
  );
}
