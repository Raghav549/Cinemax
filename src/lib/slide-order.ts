/**
 * Client-safe mirror of the database ordering in `db/slide-order.ts`
 * (latest-first: `created_at` DESC NULLS LAST, `sort_order` ASC, `id` DESC).
 *
 * The API already returns slides in this order; the hero applies it again as
 * a guard so a cached, merged or otherwise re-ordered payload still renders
 * identically on web and inside the Android WebView. Pure functions only: no
 * database imports may reach the browser bundle.
 */

/** Minimal shape the ordering needs. */
export interface SlideOrderKey {
  id: number;
  sortOrder?: number | null;
  createdAt?: string | null;
}

function createdMillis(slide: SlideOrderKey): number | null {
  if (!slide.createdAt) return null;
  const value = Date.parse(slide.createdAt);
  return Number.isFinite(value) ? value : null;
}

/**
 * The same ordering, applied to rows already in memory. Mirrors `latestFirst`
 * exactly (NULL timestamps last, then sort order, then newest id) so a cached
 * or differently-ordered payload renders identically on web and Android.
 */
export function compareLatestFirst(a: SlideOrderKey, b: SlideOrderKey): number {
  const aCreated = createdMillis(a);
  const bCreated = createdMillis(b);
  if (aCreated !== bCreated) {
    if (aCreated === null) return 1;
    if (bCreated === null) return -1;
    return bCreated - aCreated;
  }
  const aOrder = a.sortOrder ?? 0;
  const bOrder = b.sortOrder ?? 0;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return b.id - a.id;
}

/** Latest-first, de-duplicated by id (the first occurrence wins). */
export function orderSlidesLatestFirst<T extends SlideOrderKey>(list: readonly T[]): T[] {
  const seen = new Set<number>();
  const unique: T[] = [];
  for (const slide of list) {
    if (seen.has(slide.id)) continue;
    seen.add(slide.id);
    unique.push(slide);
  }
  return unique.sort(compareLatestFirst);
}
