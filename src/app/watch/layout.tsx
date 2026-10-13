import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Watch from a link",
  description: "Play a movie or share link inside Cinemax, or open it on the official service.",
};
export default function Layout({ children }: { children: ReactNode }) { return children; }
