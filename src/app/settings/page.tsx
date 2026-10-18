import type { Metadata } from "next";
import SettingsView from "@/components/miley/SettingsView";

export const metadata: Metadata = { title: "Settings", description: "Manage your MiLey profile, privacy, playback, accessibility, and account security." };
export default function SettingsPage() { return <SettingsView />; }
