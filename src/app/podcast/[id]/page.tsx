import type { Metadata } from "next";
import PodcastDetailView from "@/components/miley/PodcastDetailView";

export const metadata: Metadata = { title: "Podcast episode catalog", description: "Listen to episodes from an operator-authorized podcast show." };
export default async function PodcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PodcastDetailView id={id} />;
}
