import type { Metadata } from "next";
import NotificationsView from "@/components/miley/NotificationsView";

export const metadata: Metadata = { title: "Notifications", description: "See in-app activity and manage follow requests on MiLey." };
export default function NotificationsPage() { return <NotificationsView />; }
