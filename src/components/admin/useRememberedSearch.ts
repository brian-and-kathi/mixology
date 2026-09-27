"use client";

import { useEffect, useState } from "react";
import { cleanSearch, searchCookieAssignment } from "@/lib/search-cookie";

function writeSearch(name: string, value: string) {
  document.cookie = searchCookieAssignment(name, value, location.protocol === "https:");
}

function readSearch(name: string): string {
  const row = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  if (!row) return "";
  try {
    return cleanSearch(decodeURIComponent(row.slice(name.length + 1)));
  } catch {
    return "";
  }
}

/**
 * Search text for one admin list. Starts from the server (the URL, or the cookie)
 * and writes the cookie as it changes, so leaving the tab and coming back keeps it.
 */
export function useRememberedSearch(name: string, initial: string): [string, (value: string) => void] {
  const [q, setQState] = useState(initial);
  useEffect(() => {
    if (initial) {
      setQState(initial);
      writeSearch(name, initial);
      return;
    }
    const saved = readSearch(name);
    if (saved) setQState(saved);
  }, [name, initial]);
  function setQ(value: string) {
    const clean = cleanSearch(value);
    setQState(clean);
    writeSearch(name, clean);
  }
  return [q, setQ];
}
