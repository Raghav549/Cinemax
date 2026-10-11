import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The database connection is created lazily, on first use.
 *
 * Previously this module threw `DATABASE_URL is required` as soon as it was
 * imported. `next build` imports every route while "collecting page data",
 * so the build failed on Vercel whenever DATABASE_URL was not available at
 * build time. Now the check only happens when a query actually runs.
 */

const globalForDb = globalThis as typeof globalThis & {
  __cinemaxPool?: Pool;
  __cinemaxDb?: NodePgDatabase;
};

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL || // Vercel Postgres / Neon integration
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it in Vercel → Project → Settings → Environment Variables."
    );
  }
  return url;
}

function needsSsl(url: string): boolean {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=/i.test(url)) return true;
  // Local databases don't use SSL; hosted ones (Neon, Supabase, Vercel...) do.
  return !/@(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/)/.test(url);
}

/**
 * Remove ssl-related query params so that our explicit `ssl` option below is
 * the one that applies (pg lets URL params override the config object, and
 * `sslmode=require` is treated as strict `verify-full`, which fails on some
 * providers such as the Supabase pooler).
 */
function stripSslParams(url: string): string {
  try {
    const u = new URL(url);
    ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return url;
  }
}

export function getPool(): Pool {
  if (!globalForDb.__cinemaxPool) {
    const rawUrl = getDatabaseUrl();
    const ssl = needsSsl(rawUrl);
    const pool = new Pool({
      connectionString: ssl ? stripSslParams(rawUrl) : rawUrl,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      // Serverless functions should keep the pool small.
      max: process.env.VERCEL ? 3 : 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });

    /**
     * Hosted Postgres (Neon in particular) closes idle connections on its own
     * schedule. When that happens `pg` reports the failure as an `error` event
     * on the pool rather than on a query. Without a listener an `error` event
     * is an *uncaught exception* and takes the whole Node process down, which
     * shows up as random "database connection" failures after the app has been
     * idle. Logging and moving on lets the next query simply reconnect.
     */
    pool.on("error", (err) => {
      console.error("[db] idle client error (connection will be re-established):", err.message);
    });

    globalForDb.__cinemaxPool = pool;
  }
  return globalForDb.__cinemaxPool;
}

export function getDb(): NodePgDatabase {
  if (!globalForDb.__cinemaxDb) {
    globalForDb.__cinemaxDb = drizzle(getPool());
  }
  return globalForDb.__cinemaxDb;
}

/**
 * `db` keeps the same API as before (`db.select()...`), but the real
 * connection is only created the first time a property is accessed.
 */
export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Human-readable connection summary for /api/health — never includes secrets. */
export function describeConnection(): Record<string, unknown> {
  try {
    const url = new URL(getDatabaseUrl());
    return {
      host: url.hostname,
      port: Number(url.port) || 5432,
      database: url.pathname.replace(/^\//, ""),
      user: url.username,
      ssl: needsSsl(getDatabaseUrl()),
      source: process.env.DATABASE_URL
        ? "DATABASE_URL"
        : process.env.POSTGRES_URL
          ? "POSTGRES_URL"
          : process.env.POSTGRES_PRISMA_URL
            ? "POSTGRES_PRISMA_URL"
            : "POSTGRES_URL_NON_POOLING",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
