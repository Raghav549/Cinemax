import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { APP_APK_FILE } from "@/lib/app-promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one download URL for the app.
 *
 * A direct file response, not a redirect and not a page: the browser receives
 * `application/vnd.android.package-archive` with an attachment filename, so the
 * APK downloads immediately with the right name and no intermediate hop. The
 * artifact is the same signed build the Android workflow produces, and
 * `scripts/verify-app-promo.mjs` checks it against the package id and version.
 */
const APK_PATH = join(process.cwd(), "public", "downloads", APP_APK_FILE);

export async function GET(_req: NextRequest) {
  let size: number;
  try {
    size = statSync(APK_PATH).size;
  } catch {
    return new Response("The app package is not available on this deployment.", {
      status: 404,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }

  const stream = Readable.toWeb(createReadStream(APK_PATH)) as unknown as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-length": String(size),
      "content-disposition": `attachment; filename="${APP_APK_FILE}"`,
      // A new build ships under a new file name; within a build the bytes are fixed.
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
