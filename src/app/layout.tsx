import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import SplashScreen from "@/components/SplashScreen";
import AppChrome from "@/components/AppChrome";

const manrope = localFont({ src: "./fonts/manrope.woff2", display: "swap", variable: "--font-manrope", weight: "200 800" });
const outfit = localFont({ src: "./fonts/outfit.woff2", display: "swap", variable: "--font-outfit", weight: "100 900" });

export const metadata: Metadata = {
  applicationName: "MiLey",
  title: { default: "MiLey — music, made personal", template: "%s · MiLey" },
  description: "Listen to music shared by independent creators, build your library, and find your people on MiLey.",
  referrer: "no-referrer",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/brand/miley-symbol.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/brand/miley-app-icon.png", type: "image/png" },
  ],
  appleWebApp: { capable: true, title: "MiLey", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#100d10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <body className={`${manrope.variable} ${outfit.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: `try { if (sessionStorage.getItem('miley:intro:v1') === '1') document.documentElement.dataset.mileyIntro = 'seen'; } catch {}` }} />
      <SplashScreen />
      <AppChrome>{children}</AppChrome>
      <script dangerouslySetInnerHTML={{ __html: `
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
        }
      ` }} />
    </body>
  </html>;
}
