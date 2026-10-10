"use client";

import { useRef, useState } from "react";
import { api } from "@/components/admin/api";
import type { ShopItem } from "@/lib/shopping";

/**
 * Free-text shopping list. Type anything, tick it while shopping. Checked lines stay put and
 * strike through, so the list does not jump. A line whose name is already on the shelf gets a
 * Double check badge. The server list replaces local state after each save.
 */
export function ShopList({ initial }: { initial: ShopItem[] }) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef(initial);
  const seq = useRef(0);
  const tail = useRef(Promise.resolve());

  function show(next: ShopItem[]) {
    list.current = next;
    setItems(next);
  }

  /** Saves run one after another, so a later reply cannot wipe an earlier tick. */
  function enqueue(work: () => Promise<void>) {
    const run = tail.current.then(work, work);
    tail.current = run.then(() => {}, () => {});
  }

  function commit(body: unknown, update: (rows: ShopItem[]) => ShopItem[]) {
    const n = ++seq.current;
    const before = list.current;
    show(update(before));
    setError(null);
    enqueue(async () => {
      try {
        const data = await api<{ items: ShopItem[] }>("/api/admin/shopping", "POST", body);
        if (n === seq.current) show(data.items);
      } catch (e) {
        if (n !== seq.current) return;
        try {
          const data = await api<{ items: ShopItem[] }>("/api/admin/shopping", "GET");
          show(data.items);
        } catch {
          show(before);
        }
        setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      }
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const label = text.trim().replace(/\s+/g, " ");
    if (!label || adding) return;
    setAdding(true);
    setError(null);
    const n = ++seq.current;
    enqueue(async () => {
      try {
        const data = await api<{ items: ShopItem[] }>("/api/admin/shopping", "POST", { label });
        if (n === seq.current) show(data.items);
        setText("");
        input.current?.focus();
      } catch (err) {
        if (n === seq.current) setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      } finally {
        setAdding(false);
      }
    });
  }

  const anyDone = items.some((item) => item.done);

  return (
    <>
      <form className="a-shop-add" onSubmit={add}>
        <input
          ref={input}
          value={text}
          maxLength={120}
          placeholder="Aluminum foil"
          aria-label="Add to the shopping list"
          enterKeyHint="done"
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
        <button className="a-btn a-btn-primary" type="submit" disabled={adding || !text.trim()}>
          Add
        </button>
      </form>
      {error ? <p className="a-error" role="alert">{error}</p> : null}
      {items.length === 0 ? (
        <p className="a-quiet a-empty">Nothing on the list.</p>
      ) : (
        <ul className="a-shop">
          {items.map((item) => (
            <li key={item.id}>
              <label className={item.done ? "a-check is-done" : "a-check"}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {
                    const row = list.current.find((r) => r.id === item.id);
                    if (!row) return;
                    commit({ id: item.id, done: !row.done }, (rows) => rows.map((r) => (r.id === item.id ? { ...r, done: !r.done } : r)));
                  }}
                />
                <span>{item.label}</span>
              </label>
              {item.doubleCheck ? <span className="a-shop-flag">Double check</span> : null}
              <button type="button" className="a-shop-x" aria-label={`Remove ${item.label}`} onClick={() => commit({ id: item.id, remove: true }, (rows) => rows.filter((row) => row.id !== item.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {anyDone ? (
        <button type="button" className="a-btn a-shop-clear" onClick={() => commit({ clear: "done" }, (rows) => rows.filter((row) => !row.done))}>
          Clear checked
        </button>
      ) : null}
    </>
  );
}
