import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// DATABASE_URL comes from the environment only (Vercel env, docker compose .env, or the shell).
// The Neon HTTP driver keeps this serverless-friendly: no pool to manage on Vercel.
let client: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}

/** Run a parameterized query and return rows. */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await sql().query(text, params)) as T[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);
