import type { Metadata } from "next";
import AuthView from "@/components/miley/AuthView";

export const metadata: Metadata = { title: "Reset your password · MiLey" };
export default function ForgotPasswordPage() { return <AuthView mode="forgot" />; }
