import type { Metadata } from "next";
import AlbumDetailView from "@/components/miley/AlbumDetailView";

export const metadata: Metadata = { title: "Music album", description: "Listen to a MiLey creator album." };
export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AlbumDetailView id={id} />;
}
