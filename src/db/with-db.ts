import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { ensureMusicSchema } from "@/db/ensure-music-schema";

/**
 * Runs a query with the guarantees every route needs:
 *
 *  1. by default, legacy and MiLey schema bootstraps run once per process;
 *     set MILEY_SCHEMA_AUTO_CREATE=false after applying the canonical Drizzle
 *     schema to use a migration-only, read/write runtime role;
 *  2. a single transparent retry for connection-level failures, which hosted
 *     Postgres produces when it drops an idle socket.
 */
export async function withDb<T>(run: (db: NodePgDatabase) => Promise<T>): Promise<T> {
  // `ensureSchema` resolves with a report instead of throwing: a database that
  // refuses DDL (read-only branch, restricted role) should still serve reads.
  const autoCreate = process.env.MILEY_SCHEMA_AUTO_CREATE !== "false";
  if (autoCreate) await ensureSchema();
  await ensureMusicSchema();
  try {
    return await run(getDb());
  } catch (error) {
    if (!isRetryable(error)) throw error;
    return run(getDb());
  }
}

const RETRYABLE_CODES = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

const RETRYABLE_MESSAGES = new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN"]);

type PgError = Error & { code?: string };

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as PgError;
  if (err.code && RETRYABLE_CODES.has(err.code)) return true;
  const name = (err as NodeJS.ErrnoException).code;
  return Boolean(name && RETRYABLE_MESSAGES.has(name));
}

/**
 * Turn a database failure into something the admin panel can show.
 *
 * Drizzle wraps the driver error in "Failed query: select … params: …", which
 * hides the actual cause and echoes the statement (and its parameters) back to
 * the browser. Walking to the innermost error gives the plain Postgres message
 * — `column "poster_url" of relation "movies" does not exist` — which is the one
 * sentence that explains an empty admin panel.
 */
export function describeDbError(error: unknown): { message: string; code?: string } {
  let innermost: PgError | null = null;
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as PgError;
    if (typeof candidate.message === "string" && candidate.message) innermost = candidate;
    current = (current as { cause?: unknown }).cause;
  }

  if (innermost) return { message: innermost.message, code: innermost.code };
  return { message: "Database request failed" };
}
