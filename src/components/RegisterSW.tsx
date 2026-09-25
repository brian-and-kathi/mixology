"use client";

import { useEffect } from "react";

/** Registers the passthrough service worker (installability only; it caches nothing). */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  return null;
}
