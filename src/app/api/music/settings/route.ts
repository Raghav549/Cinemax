import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { userSettings } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";
const defaults = {
  playback: { autoplay: false, rememberQueue: true, dataSaver: false, playbackSpeed: 1, volume: 0.8, sleepTimerMinutes: 0 },
  notifications: { follows: true, followRequests: true, channelSubscriptions: true, channelReleases: true, messages: true },
  accessibility: { reducedMotion: false, highContrast: false },
};
const allowedKeys: Record<keyof typeof defaults, Set<string>> = {
  playback: new Set(Object.keys(defaults.playback)),
  notifications: new Set(Object.keys(defaults.notifications)),
  accessibility: new Set(Object.keys(defaults.accessibility)),
};

function cleanGroup(group: keyof typeof defaults, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowedKeys[group].has(key)) continue;
    const fallback = (defaults[group] as Record<string, unknown>)[key];
    if (typeof fallback === "boolean" && typeof value === "boolean") output[key] = value;
    else if (typeof fallback === "number" && typeof value === "number" && Number.isFinite(value)) {
      if (key === "playbackSpeed") output[key] = Math.max(0.5, Math.min(2, value));
      else if (key === "volume") output[key] = Math.max(0, Math.min(1, value));
      else if (key === "sleepTimerMinutes") output[key] = Math.max(0, Math.min(180, Math.round(value)));
    }
  }
  return output;
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const rows = await withDb((db) => db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1));
    const setting = rows[0];
    return NextResponse.json({ playback: { ...defaults.playback, ...(setting?.playback || {}) }, notifications: { ...defaults.notifications, ...(setting?.notifications || {}) }, accessibility: { ...defaults.accessibility, ...(setting?.accessibility || {}) } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Settings could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  if (!body) return fail("Settings were invalid.");
  const groups = {
    playback: cleanGroup("playback", body.playback),
    notifications: cleanGroup("notifications", body.notifications),
    accessibility: cleanGroup("accessibility", body.accessibility),
  };
  try {
    const previous = await withDb((db) => db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1));
    const row = previous[0];
    const merged = {
      playback: { ...defaults.playback, ...(row?.playback || {}), ...groups.playback },
      notifications: { ...defaults.notifications, ...(row?.notifications || {}), ...groups.notifications },
      accessibility: { ...defaults.accessibility, ...(row?.accessibility || {}), ...groups.accessibility },
      updatedAt: new Date(),
    };
    await withDb((db) => db.insert(userSettings).values({ userId: user.id, ...merged }).onConflictDoUpdate({ target: userSettings.userId, set: merged }));
    const profile: Record<string, boolean> = {};
    if (typeof body.isPrivate === "boolean") profile.isPrivate = body.isPrivate;
    if (typeof body.recommendationsEnabled === "boolean") profile.recommendationsEnabled = body.recommendationsEnabled;
    if (typeof body.historyEnabled === "boolean") profile.historyEnabled = body.historyEnabled;
    if (Object.keys(profile).length) {
      const { users } = await import("@/db/music-schema");
      await withDb((db) => db.update(users).set({ ...profile, updatedAt: new Date() }).where(eq(users.id, user.id)));
    }
    return NextResponse.json({ ...merged, profile });
  } catch { return fail("Settings could not be saved.", 503); }
}
