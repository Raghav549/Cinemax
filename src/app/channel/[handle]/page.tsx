import type { Metadata } from "next";
import ChannelDetailView from "@/components/miley/ChannelDetailView";

export const metadata: Metadata = { title: "Creator channel", description: "Explore original releases and channel updates from a MiLey creator." };
export default async function ChannelPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ChannelDetailView handle={handle} />;
}
