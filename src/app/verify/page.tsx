import type { Metadata } from "next";
import VerifyEmailView from "./VerifyEmailView";

export const metadata: Metadata = { title: "Verify your email · MiLey" };
export default function VerifyPage() { return <VerifyEmailView />; }
