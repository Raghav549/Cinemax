import type { Metadata } from "next";
import ProfileView from "@/components/miley/ProfileView";

export const metadata: Metadata = { title: "Listener profile", description: "Discover music and playlists shared by a MiLey listener." };
export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfileView username={username} />;
}
