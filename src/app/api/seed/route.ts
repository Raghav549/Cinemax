import { NextResponse } from "next/server";
import { ensureSchema } from "@/db/ensure-schema";
import { auditAndSyncCatalog, type CatalogAuditReport } from "@/lib/catalog-audit";

let initialSyncPromise: Promise<CatalogAuditReport> | null = null;

export function ensureCatalogSynced(force = false): Promise<CatalogAuditReport> {
  if (!initialSyncPromise || force) {
    initialSyncPromise = (async () => {
      await ensureSchema();
      return auditAndSyncCatalog();
    })().catch((err) => {
      initialSyncPromise = null;
      throw err;
    });
  }
  return initialSyncPromise;
}

export async function POST() {
  try {
    const report = await ensureCatalogSynced(true);
    return NextResponse.json({
      message: "Catalog audited, verified, and synchronized successfully",
      report,
    });
  } catch (error: unknown) {
    console.error("Seed / catalog audit error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Catalog sync failed", details: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
