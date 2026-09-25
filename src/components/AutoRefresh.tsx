"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetch server data on an interval so the TV follows inventory changes without a reload. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
