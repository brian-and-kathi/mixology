/**
 * Return path after sign-in. Only same-origin admin paths are allowed: "/admin…" or "/db…".
 * No "//", backslashes, or control characters (which some browsers treat as a new host); never the
 * sign-in page itself. Anything else falls back to Stock.
 */
export function safeAdminNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (s.length > 512) return "/admin";
  if (!/^\/(?:admin|db)(?:$|[/?#])/.test(s)) return "/admin";
  if (s.includes("//") || s.includes("\\") || /[\u0000-\u001f\u007f]/.test(s)) return "/admin";
  // Dot segments (plain or percent-encoded) could climb out of /admin; still same-origin, but refuse them.
  if (/(^|\/)(\.|%2e){1,2}(\/|$|[?#])/i.test(s)) return "/admin";
  if (/^\/admin\/login(?:$|[/?#])/.test(s)) return "/admin";
  return s;
}
