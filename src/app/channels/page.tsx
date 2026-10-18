import type { Metadata } from "next";
import ChannelsView from "@/components/miley/ChannelsView";

export const metadata: Metadata = { title: "Creator channels", description: "Discover real independent music channels on MiLey." };
export default function ChannelsPage() { return <ChannelsView />; }
