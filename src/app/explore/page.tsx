import type { Metadata } from "next";
import ExploreView from "@/components/miley/ExploreView";

export const metadata: Metadata = { title: "Explore music", description: "Search real music, albums, public playlists, and independent creator channels on MiLey." };
export default function ExplorePage() { return <ExploreView />; }
