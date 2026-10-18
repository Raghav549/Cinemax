import type { Metadata } from "next";
import PlaylistDetailView from "@/components/miley/PlaylistDetailView";

export const metadata: Metadata = { title: "Music playlist", description: "Listen to a playlist curated on MiLey." };
export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaylistDetailView id={id} />;
}
