import { and, eq, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { podcastSubscriptions, podcasts } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId } from "@/lib/miley-api";

export const dynamic = "force-dynamic";
async function change(request: NextRequest, idValue: string, subscribe: boolean) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId(idValue);
  if (!id) return fail("Podcast not found.", 404);
  try {
    const exists = await withDb((db) => db.select({ id: podcasts.id }).from(podcasts).where(and(eq(podcasts.id, id), eq(podcasts.distributionAuthorized, true), isNotNull(podcasts.rightsReviewedAt))).limit(1));
    if (!exists.length) return fail("Podcast not found.", 404);
    if (subscribe) await withDb((db) => db.insert(podcastSubscriptions).values({ userId: user.id, podcastId: id }).onConflictDoNothing());
    else await withDb((db) => db.delete(podcastSubscriptions).where(and(eq(podcastSubscriptions.userId, user.id), eq(podcastSubscriptions.podcastId, id))));
    return NextResponse.json({ subscribed: subscribe });
  } catch { return fail("Podcast subscription could not be updated.", 503); }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return change(request, (await context.params).id, true); }
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { return change(request, (await context.params).id, false); }
