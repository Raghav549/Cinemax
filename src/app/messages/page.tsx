import type { Metadata } from "next";
import MessagesView from "@/components/miley/MessagesView";

export const metadata: Metadata = { title: "Messages", description: "Message people who mutually follow you on MiLey." };
export default function MessagesPage() { return <MessagesView />; }
