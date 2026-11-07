import { asc, desc, sql, type SQL } from "drizzle-orm";
import { slides } from "@/db/schema";

/**
 * The one database ordering for homepage slides, shared by the public
 * `/api/slides` query and the studio's `/api/admin/slides` list. The
 * client-side guard in `lib/slide-order.ts` mirrors it exactly, so what the
 * admin sees, what the API returns and what the homepage renders can never
 * disagree.
 *
 * Latest-first, by the slide's own creation time:
 *
 *   1. `created_at` descending - the slide published most recently leads.
 *      The column is set once, by the database default, when the row is
 *      inserted; editing a slide never touches it (see `slidePatch`), so an
 *      update cannot make an old slide jump to the front.
 *   2. `sort_order` ascending - the studio's existing "Sort Order" field
 *      breaks ties between slides created in the same instant (bulk imports).
 *   3. `id` descending - the serial id is the final, always-present
 *      tiebreaker. It is also what keeps the order deterministic for legacy
 *      rows whose `created_at` is NULL (those sort after every dated slide,
 *      newest id first).
 *
 * Before this module the query ordered by `sort_order` alone. Every slide the
 * studio adds defaults to order 0, so all of them tied and Postgres returned
 * them in whatever physical order it liked - the newest slide landed anywhere,
 * and could move between two requests.
 */
export function latestFirst(): SQL[] {
  return [
    sql`${slides.createdAt} DESC NULLS LAST`,
    asc(slides.sortOrder),
    desc(slides.id),
  ];
}
