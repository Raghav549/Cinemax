import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalView from "@/components/miley/LegalView";

const TITLES = { terms: "Terms of service", privacy: "Privacy policy", copyright: "Copyright & music rights" } as const;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; return { title: TITLES[slug as keyof typeof TITLES] || "Legal information" };
}
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(slug in TITLES)) notFound();
  return <LegalView kind={slug as keyof typeof TITLES} />;
}
