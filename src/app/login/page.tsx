import type { Metadata } from "next";
import AuthView from "@/components/miley/AuthView";

export const metadata: Metadata = { title: "Sign in to MiLey", description: "Sign in to your MiLey music account." };
export default function LoginPage() { return <AuthView mode="login" />; }
