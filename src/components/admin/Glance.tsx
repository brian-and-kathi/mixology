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

/** How a To Buy row is read aloud and copied. A combined row stays one sentence here. */
function buyName(b: GlanceData["buy"][number]) {
  return cap(b.specs.join(" + "));
}

/** One shopping-list line per ingredient. "Apricot brandy + scotch" is two lines, not one. */
function shopLabels(specs: string[]) {
  return specs.map((spec) => cap(spec));
}

function onShop(items: { label: string }[], name: string) {
  const key = shopKey(name);
  return items.some((item) => shopKey(item.label) === key);
}

function ShopButton({ phrase, listed, onClick }: { phrase: string; listed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={listed ? "a-btn a-glance-add is-on" : "a-btn a-glance-add"}
      aria-pressed={listed}
      aria-label={listed ? `Remove ${phrase} from the shopping list` : `Add ${phrase} to the shopping list`}
      onClick={onClick}
    >
      {listed ? "Remove" : "Add"}
    </button>
  );
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
  const onList = (name: string) => onShop(shopItems, name);

  function showShop(next: ShopItem[]) {
    shopRef.current = next;
    setShopItems(next);
  }

  /** One save at a time, so a second tap cannot be overwritten by the first reply. */
  function toggleShop(names: string[], legacy?: string) {
    const n = ++seq.current;
    const before = shopRef.current;
    const missing = names.filter((name) => !onShop(before, name));
    const dropLegacy = Boolean(legacy && onShop(before, legacy));
    const allOn = missing.length === 0;
    setShopError(null);
    if (allOn) {
      const drop = new Set(names.map((name) => shopKey(name)));
      if (dropLegacy && legacy) drop.add(shopKey(legacy));
      showShop(before.filter((item) => !drop.has(shopKey(item.label))));
    } else {
      const kept = dropLegacy && legacy ? before.filter((item) => shopKey(item.label) !== shopKey(legacy)) : before;
      showShop([...kept, ...missing.map((label, i) => ({ id: `pending-${n}-${i}`, label, done: false, doubleCheck: false }))]);
    }
    const work = async () => {
      try {
        let saved: { items: ShopItem[] } | null = null;
        if (dropLegacy && legacy) saved = await api<{ items: ShopItem[] }>("/api/admin/shopping", "POST", { label: legacy, remove: true });
        if (allOn) {
          for (const name of names) saved = await api<{ items: ShopItem[] }>("/api/admin/shopping", "POST", { label: name, remove: true });
        } else {
          for (const name of missing) saved = await api<{ items: ShopItem[] }>("/api/admin/shopping", "POST", { label: name });
        }
        if (n === seq.current && saved) showShop(saved.items);
      } catch (e) {
        if (n !== seq.current) return;
        try {
          const fresh = await api<{ items: ShopItem[] }>("/api/admin/shopping", "GET");
          showShop(fresh.items);
        } catch {
          showShop(before);
        }
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
                  const names = shopLabels(b.specs);
                  const listed = names.every((part) => onList(part));
                  const acting = listed ? names : names.filter((part) => !onList(part));
                  const phrase = acting.join(" and ");
                  return (
                    <li key={b.specs.join("|")}>
                      <span className="a-glance-copy">
                        <strong>{name}</strong>
                        {b.with.length ? <span className="a-quiet"> (with {b.with.join(", ")})</span> : b.specs.length > 1 ? <span className="a-quiet"> (together)</span> : null}
                        <span className="a-quiet"> unlocks {b.recipes.length === 1 ? b.recipes[0] : `${b.recipes.length}: ${b.recipes.join(", ")}`}</span>
                      </span>
                      <ShopButton phrase={phrase} listed={listed} onClick={() => toggleShop(names, names.length > 1 ? name : undefined)} />
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
            <>
              <ul className="a-plain a-glance-rows">
                {data.oneAway.map((r) => {
                  const name = cap(r.missing[0]);
                  const listed = onList(name);
                  return (
                    <li key={r.id}>
                      <span className="a-glance-copy">
                        <Link href={`/admin/recipes/${r.id}`}>{r.name}</Link>
                        <span className="a-quiet"> needs {name}</span>
                      </span>
                      <ShopButton phrase={name} listed={listed} onClick={() => toggleShop([name])} />
                    </li>
                  );
                })}
              </ul>
              {shopError ? <p className="a-error" role="alert">{shopError}</p> : null}
            </>
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
