import type { Metadata } from "next";
import AuthView from "@/components/miley/AuthView";

export const metadata: Metadata = { title: "Choose a new password · MiLey" };
export default function ResetPasswordPage() { return <AuthView mode="reset" />; }
