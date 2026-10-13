import { NextResponse } from "next/server";
import { ensureSchema } from "@/db/ensure-schema";

export const dynamic = "force-dynamic";

/**
 * Schema check only. This endpoint never inserts, updates or deletes catalogue
 * rows: movies, slides and categories are managed exclusively from the studio
 * (/gate-keeper).
 *
 * It used to run a hardcoded "catalog sync" on every request (and was called
 * automatically by every new browser), which re-inserted demo titles, restored
 * slides an admin had deleted, overwrote admin edits and removed admin uploads.
 */
async function report() {
  try {
    const schema = await ensureSchema();
    return NextResponse.json({
      message: "Automatic catalogue seeding is disabled. Manage titles and slides in the studio.",
      schemaOk: schema.ok,
      schemaError: schema.ok ? null : schema.error,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Schema check failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return report();
}

export async function POST() {
  return report();
}
