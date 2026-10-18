import type { Metadata } from "next";
import PodcastCatalogView from "@/components/miley/PodcastCatalogView";

export const metadata: Metadata = { title: "Podcasts", description: "Browse podcasts only after operator review of distribution permissions." };
export default function PodcastsPage() { return <PodcastCatalogView />; }
