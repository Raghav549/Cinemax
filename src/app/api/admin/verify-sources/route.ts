import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/db/ensure-schema";
import type { CatalogStatus, SourceType } from "@/db/rows";
import { isAdmin, unauthorized } from "@/lib/api";
import { recheckCatalogSources, verifyMovieSource } from "@/lib/verification";

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return unauthorized();
    }
    await ensureSchema();
    const origin = req.nextUrl.origin;

    let body: Record<string, unknown> | null = null;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }

    if (body && typeof body.videoUrl === "string") {
      const report = await verifyMovieSource(
        {
          title: typeof body.title === "string" && body.title.trim() ? body.title : "Verification Probe",
          description:
            typeof body.description === "string" && body.description.trim()
              ? body.description
              : "Admin verification probe for media playback source.",
          year: typeof body.year === "number" ? body.year : 2024,
          duration: typeof body.duration === "string" && body.duration.trim() ? body.duration : "1h 30m",
          language: typeof body.language === "string" && body.language.trim() ? body.language : "English",
          genre: typeof body.genre === "string" && body.genre.trim() ? body.genre : "Drama",
          rightsConfirmed: body.rightsConfirmed !== undefined ? Boolean(body.rightsConfirmed) : true,
          videoUrl: body.videoUrl,
          sourceType: (typeof body.sourceType === "string" ? body.sourceType : "direct") as SourceType,
          catalogStatus: (typeof body.catalogStatus === "string"
            ? body.catalogStatus
            : "verified_playable") as CatalogStatus,
          trailerUrl: typeof body.trailerUrl === "string" ? body.trailerUrl : undefined,
        },
        { baseUrl: origin }
      );
      return NextResponse.json({
        verification: {
          ...report,
          ok: report.verified,
        },
      });
    }

    const summary = await recheckCatalogSources({ baseUrl: origin });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Source verification error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
