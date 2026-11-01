import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import SplashScreen from "@/components/SplashScreen";
import AppChrome from "@/components/AppChrome";
import AppPromo from "@/components/AppPromo";

const manrope = localFont({ src: "./fonts/manrope.woff2", display: "swap", variable: "--font-manrope", weight: "200 800" });
const outfit = localFont({ src: "./fonts/outfit.woff2", display: "swap", variable: "--font-outfit", weight: "100 900" });

/**
 * Canonical origin for every relative metadata URL (Open Graph images, share
 * links, canonicals). The official domain is the default; `NEXT_PUBLIC_SITE_URL`
 * overrides it, so a preview deployment still declares the production URL that
 * people actually share.
 */
function canonicalSiteUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  try {
    // A deployment hostname is never the canonical origin people share, even if
    // an environment variable on a preview build still points at one.
    if (configured && !/\.vercel\.app$/i.test(new URL(configured).hostname)) return configured;
  } catch {
    // A malformed value falls back to the official domain below.
  }
  return "https://cinemaxtv.space";
}

const siteUrl = canonicalSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Cinemax — Movies & Series", template: "%s · Cinemax" },
  description: "Discover movies, series and anime. Save your favourites and pick up where you left off on Cinemax.",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/brand/cinemax-symbol.svg", type: "image/svg+xml" },
    { rel: "icon", url: "/icon-192.png" },
    { rel: "apple-touch-icon", url: "/icon-192.png" },
  ],
};

export const viewport: Viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <body className={`${manrope.variable} ${outfit.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: `try { if (sessionStorage.getItem('cinemax:prism-intro:v1') === '1') document.documentElement.dataset.cinemaxIntro = 'seen'; } catch {}` }} />
      <SplashScreen />
      <AppChrome>{children}</AppChrome>
      <AppPromo />
      <script dangerouslySetInnerHTML={{ __html: `
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
        }
      ` }} />
    </body>
  </html>;
}
