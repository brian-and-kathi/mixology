"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/admin/api";

type View = { source: string; target: { base: string; token: string } | null; dismissedAt: string | null };

/**
 * Bar tab: "Show White Elephant from" (migration 041). While Shindig reports a live White Elephant game for this TV
 * link, /tv shows Shindig's dashboard instead of the menu. "Back to menu" puts the menu back for the game in progress.
 */
export function TvGameCard() {
  const [view, setView] = useState<View | null>(null);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<View>("/api/admin/tv-game", "GET").then((v) => { setView(v); setSource(v.source); }).catch((e) => setMsg(e.message));
  }, []);
  async function run(method: string, body: unknown, done: string) {
    setBusy(true); setMsg(null);
    try { const v = await api<View>("/api/admin/tv-game", method, body); setView(v); setSource(v.source); setMsg(done); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  }
  const dirty = !!view && source.trim() !== view.source;
  return (
    <section className="a-card a-tvgame" aria-label="White Elephant on the TV">
      <form onSubmit={(e) => { e.preventDefault(); void run("PUT", { source }, source.trim() ? "Saved. The TV switches when White Elephant goes live." : "Off. The TV stays on the menu."); }}>
        <label className="a-field"><span className="a-label">Show White Elephant from</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Shindig TV link or token" maxLength={300} autoComplete="off" spellCheck={false} />
        </label>
        <div className="a-row-btns" style={{ justifyContent: "flex-start" }}>
          <button type="submit" className="a-btn" disabled={busy || !dirty}>Save</button>
          <button type="button" className="a-btn" disabled={busy || !view?.target} onClick={() => void run("POST", { dismiss: true }, "Back to the menu for this game.")}>Back to menu</button>
        </div>
      </form>
      {msg ? <p className="a-quiet a-small" role="status">{msg}</p> : null}
    </section>
  );
}
