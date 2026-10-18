import { describeConnection, getPool } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { ensureMusicSchema } from "@/db/ensure-music-schema";

export const dynamic = "force-dynamic";

/** Reports MiLey schema/readiness without returning connection secrets. */
export async function GET() {
  const connection = describeConnection();
  const autoCreate = process.env.MILEY_SCHEMA_AUTO_CREATE !== "false";

  try {
    await getPool().query("select 1");
  } catch (error) {
    return Response.json({ ok: false, stage: "connect", error: message(error), connection }, { status: 500 });
  }

  if (autoCreate) {
    const legacySchema = await ensureSchema();
    if (!legacySchema.ok) {
      return Response.json({ ok: false, stage: "legacy-schema", error: legacySchema.error, connection }, { status: 500 });
    }
    try {
      await ensureMusicSchema();
    } catch (error) {
      return Response.json({ ok: false, stage: "music-schema", error: message(error), connection }, { status: 500 });
    }
  }

  try {
    const { rows } = await getPool().query<{ users: number; channels: number; tracks: number; authorized_podcasts: number }>(`
      select
        (select count(*) from miley_users)::int as users,
        (select count(*) from miley_channels)::int as channels,
        (select count(*) from miley_tracks)::int as tracks,
        (select count(*) from miley_podcasts where distribution_authorized = true and rights_reviewed_at is not null)::int as authorized_podcasts
    `);
    return Response.json({ ok: true, connection, schema: { autoCreate }, counts: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, stage: "read", error: message(error), connection, schema: { autoCreate } }, { status: 500 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
