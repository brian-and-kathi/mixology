/** Small JSON fetch helper for admin client components. Throws Error(message) on failure. */
export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("No connection. Try again.");
  }
  if (res.status === 401) {
    window.location.href = `/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new Error("Signed out.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Couldn't save. Try again.");
  return data;
}
