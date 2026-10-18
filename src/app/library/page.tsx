import type { Metadata } from "next";
import LibraryView from "@/components/miley/LibraryView";

export const metadata: Metadata = { title: "Your library", description: "Manage favorites, listening history, playlists, albums, music notes, and creator uploads." };
export default function LibraryPage() { return <LibraryView />; }
