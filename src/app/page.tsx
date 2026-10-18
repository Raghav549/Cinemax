import type { Metadata } from "next";
import HomeView from "@/components/miley/HomeView";

export const metadata: Metadata = { title: "Music, made personal", description: "Discover real independent releases, keep your music library close, and connect with the people who share your sound." };
export default function HomePage() { return <HomeView />; }
