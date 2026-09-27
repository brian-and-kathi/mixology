"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

/** Replace tonight's knock and phrase. Anyone who already knocked has to knock again. */
export function RollNight() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function roll() {
    if (busy) return;
    const ok = window.confirm("Replace tonight's code and phrase? Anyone who already knocked will have to knock again.");
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/night", "POST");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't replace the code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a-night-roll">
      <button type="button" className="a-btn" onClick={roll} disabled={busy}>
        {busy ? "Replacing…" : "New code"}
      </button>
      {error ? <p className="a-error">{error}</p> : null}
    </div>
  );
}
