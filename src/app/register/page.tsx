import type { Metadata } from "next";
import AuthView from "@/components/miley/AuthView";

export const metadata: Metadata = { title: "Create your MiLey account", description: "Join MiLey to discover independent music, save your library, and connect with creators and listeners." };
export default function RegisterPage() { return <AuthView mode="register" />; }
