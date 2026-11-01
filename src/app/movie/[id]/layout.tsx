import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadTitleForShare, titleMetadata } from "@/lib/share-server";

/**
 * Metadata only.
 *
 * The detail screen itself is a client component (it streams, plays video and
 * keeps resume state), so it cannot export `generateMetadata`. This pass-through
 * layout adds the Open Graph / Twitter card for the title without touching the
 * rendered page: same markup, same providers, same layout.
 *
 * The read is a single indexed row and failures are swallowed by
 * `loadTitleForShare`, so a database hiccup degrades the social preview and
 * never the page.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const title = await loadTitleForShare(id);
  return titleMetadata(title, { title: "Title" }, `/movie/${id}`);
}

export default function MovieLayout({ children }: { children: ReactNode }) {
  return children;
}
