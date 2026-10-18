import { eq } from "drizzle-orm";
import { notifications, userSettings } from "@/db/music-schema";
import { withDb } from "@/db/with-db";

const preferenceByKind: Record<string, string> = {
  new_follower: "follows",
  follow_request: "followRequests",
  follow_accepted: "followRequests",
  channel_subscription: "channelSubscriptions",
  channel_release: "channelReleases",
  message: "messages",
};

/** Record an in-app notification only when the recipient has opted in. */
export async function createNotification(userId: number, actorId: number | null, kind: string, resourceId?: number | null): Promise<void> {
  if (actorId === userId) return;
  try {
    await withDb(async (db) => {
      const [setting] = await db.select({ notifications: userSettings.notifications })
        .from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
      const preference = preferenceByKind[kind];
      if (preference && setting?.notifications && setting.notifications[preference] === false) return;
      await db.insert(notifications).values({ userId, actorId, kind, resourceId: resourceId ?? null });
    });
  } catch (error) {
    console.error("[miley:notification] write failed:", error instanceof Error ? error.message : "unknown error");
  }
}
