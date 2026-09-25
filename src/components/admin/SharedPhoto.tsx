"use client";

import { useEffect, useState } from "react";

const DB_NAME = "mixology-share";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Shows the photo shared to the app (stashed in this browser's IndexedDB by /sw.js) as a
 * reference while adding a bottle. It never leaves the phone; "Dismiss" deletes it.
 */
export function SharedPhoto({ fromShare }: { fromShare: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    openDb()
      .then((db) => new Promise<{ blob?: Blob } | undefined>((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get("latest");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }))
      .then((rec) => {
        if (rec?.blob) {
          objectUrl = URL.createObjectURL(rec.blob);
          setUrl(objectUrl);
        } else if (fromShare) setMissing(true);
      })
      .catch(() => fromShare && setMissing(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fromShare]);

  async function dismiss() {
    const db = await openDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).delete("latest");
    setUrl(null);
  }

  if (missing) return <p className="a-quiet a-small">The shared photo didn&apos;t come through. Share it again from Photos.</p>;
  if (!url) return null;
  return (
    <figure className="a-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Shared bottle photo (reference only)" />
      <figcaption>
        <span className="a-quiet a-small">Reference photo. It stays on this phone and isn&apos;t saved.</span>
        <button type="button" className="a-link" onClick={dismiss}>Dismiss</button>
      </figcaption>
    </figure>
  );
}
