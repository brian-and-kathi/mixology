import { UserError } from "@/lib/admin-guard";
import { isUuid as uuidOk, query, sql } from "@/lib/db";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidOk(value);
}

export class ValidationError extends UserError {}

type Stmt = [string, unknown[]];

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return query<T>(text, params);
}

/** One Neon HTTP transaction. Every statement is known up front (ids are chosen here, not returned). */
export async function tx(stmts: Stmt[]): Promise<void> {
  if (stmts.length === 0) return;
  await sql().transaction((t) => stmts.map(([text, params]) => t.query(text, params)));
}

export function blank(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function lowerName(value: unknown): string | null {
  const text = blank(value);
  return text == null ? null : text.toLowerCase();
}

export function many(value: unknown): string[] {
  if (value == null || value === "") return [];
  return (Array.isArray(value) ? value : [value]).map((item) => String(item)).filter(Boolean);
}

export function checked(value: unknown): boolean {
  return value === "on" || value === "true" || value === "1" || value === true;
}

export function numberOrNull(value: unknown, label: string): number | null {
  const text = blank(value);
  if (text == null) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new ValidationError(`${label} must be a number.`);
  return number;
}

export function slugify(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function aliasesFromText(value: unknown): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of String(value ?? "").split(/[\n,]/)) {
    const alias = part.trim().toLowerCase();
    if (!alias || seen.has(alias)) continue;
    seen.add(alias);
    aliases.push(alias);
  }
  return aliases;
}

export function dbMessage(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  const e = error as { code?: string; message?: string; detail?: string };
  if (e?.code === "23505") return "That name is already taken.";
  if (e?.code === "23503") return "That item is still in use, so it was not deleted.";
  if (e?.code === "23514" || e?.code === "P0001") {
    const msg = (e.message ?? "That change isn't allowed.").replace(/ \(DESIGN §10\)\.?$/, ".");
    return msg.charAt(0).toUpperCase() + msg.slice(1);
  }
  if (e?.detail) return `${e.message ?? "Couldn't save."} ${e.detail}`;
  return e?.message || "Couldn't save. Try again.";
}

export function isUserError(error: unknown): boolean {
  if (error instanceof UserError) return true;
  const code = String((error as { code?: string })?.code ?? "");
  return code.startsWith("22") || code.startsWith("23") || code === "P0001";
}

export function log(entity: string, id: string, action: string, summary: string, before: unknown, after: unknown): Stmt {
  return [
    `INSERT INTO change_log (entity, entity_id, action, summary, before, after) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [entity, id, action, summary, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  ];
}
