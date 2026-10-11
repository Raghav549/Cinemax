import { describeConnection, getPool } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";

export const dynamic = "force-dynamic";

/**
 * Reports *why* the database is unhappy, not just that it is.
 *
 * `{"ok":true}` used to mean "the TCP connection worked", while every table
 * query still failed with `column "poster_url" of relation "movies" does not
 * exist`. That combination is exactly what makes an empty admin panel look like
 * a connection problem, so the response now covers connect → schema → read.
 * Secrets are never included.
 */
export async function GET() {
  const connection = describeConnection();

  try {
    await getPool().query("select 1");
  } catch (error) {
    return Response.json(
      { ok: false, stage: "connect", error: message(error), connection },
      { status: 500 }
    );
  }

  const schema = await ensureSchema();
  if (!schema.ok) {
    return Response.json(
      { ok: false, stage: "schema", error: schema.error, connection, tables: schema.tables },
      { status: 500 }
    );
  }

  try {
    const { rows } = await getPool().query<{ count: number }>(
      `select (select count(*) from movies)::int as movies,
              (select count(*) from slides)::int as slides,
              (select count(*) from categories)::int as categories`
    );
    return Response.json({ ok: true, connection, tables: schema.tables, counts: rows[0] });
  } catch (error) {
    return Response.json(
      { ok: false, stage: "read", error: message(error), connection, tables: schema.tables },
      { status: 500 }
    );
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
