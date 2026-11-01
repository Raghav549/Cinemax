/**
 * The generated share card — one renderer, used by Open Graph, Twitter and the
 * website's own share sheet.
 *
 * It is drawn from real records only: the title's own poster and backdrop, its
 * title, type, year and genre, the CINEMAX mark, and the title's link. It never
 * invents artwork, a score or a badge. If a remote image cannot be fetched the
 * card simply lays out without it instead of showing a broken frame.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export interface CardTitle {
  id: number;
  title: string;
  year?: number | null;
  genre?: string | null;
  type?: string | null;
  description?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/* This module is rendered by Satori inside ImageResponse, which has no
   next/image and no optimizer: plain <img> elements with data URIs are the only
   supported form. */
/* eslint-disable @next/next/no-img-element */

/** Formats the card renderer decodes natively. */
const NATIVE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/svg+xml"]);

/**
 * Remote image → data URI, or null when it cannot be used. Never throws.
 *
 * Artwork can arrive as WebP (the brand assets are WebP, and an admin may point
 * a title at any licensed host), which the card renderer cannot decode. Those are
 * transcoded to JPEG with the image library that ships alongside the framework's
 * own image pipeline. If that library is not present in an environment, the
 * image is simply left out — the card still renders, it is never a broken frame.
 */
async function inlineImage(rawUrl: string | null | undefined, timeoutMs = 3500): Promise<string | null> {
  const url = (rawUrl ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "image/*" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    if (NATIVE_TYPES.has(type)) return `data:${type};base64,${buffer.toString("base64")}`;
    return await transcodeToJpeg(buffer);
  } catch {
    return null;
  }
}

async function transcodeToJpeg(buffer: Buffer): Promise<string | null> {
  try {
    const { default: sharp } = await import("sharp");
    const jpeg = await sharp(buffer).resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The project's own emblem, from the file that ships with the site. */
async function emblemDataUri(): Promise<string | null> {
  try {
    const svg = await readFile(join(process.cwd(), "public", "brand", "cinemax-symbol.svg"));
    return `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    return null;
  }
}

let cachedFont: ArrayBuffer | null = null;

/**
 * The brand face (Outfit SemiBold), read from the file that ships with the site
 * rather than re-fetched over HTTP: the card is rendered inside the same
 * deployment, and a self-request would only add latency and a failure mode.
 * The font is licensed under the SIL Open Font License 1.1 (see
 * public/fonts/OUTFIT-LICENSE.txt). If it cannot be read the card falls back to
 * the renderer's default face — the layout is unchanged.
 */
export async function shareCardFont(): Promise<ArrayBuffer | null> {
  if (cachedFont) return cachedFont;
  try {
    const file = await readFile(join(process.cwd(), "public", "fonts", "outfit-semibold.ttf"));
    if (!file.byteLength) return null;
    const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    cachedFont = data;
    return data;
  } catch {
    return null;
  }
}

/** Everything the card needs, fetched once so the JSX below stays synchronous. */
export interface CardAssets {
  poster: string | null;
  backdrop: string | null;
  emblem: string | null;
}

export async function loadCardAssets(title: CardTitle | null): Promise<CardAssets> {
  const [poster, backdrop, emblem] = await Promise.all([
    inlineImage(title?.posterUrl),
    inlineImage(title?.backdropUrl),
    emblemDataUri(),
  ]);
  return { poster, backdrop, emblem };
}

const TYPE_LABEL: Record<string, string> = {
  movie: "Movie",
  series: "Series",
  anime: "Anime",
};

function subtitleOf(title: CardTitle): string {
  const parts = [TYPE_LABEL[(title.type ?? "").toLowerCase()] ?? title.type, title.year ? String(title.year) : null, title.genre?.split(",")[0]?.trim()]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.join("  ·  ");
}

function clamp(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * The card itself. 1200 × 630 (the size every social platform crops from), with
 * the poster on the left, the title's own backdrop behind it, and the CINEMAX
 * mark bottom-left so the card is unmistakably from this catalogue.
 */
export function ShareCard({ title, assets }: { title: CardTitle | null; assets: CardAssets }): ReactElement {
  const heading = title?.title?.trim() || "CINEMAX";
  const subtitle = title ? subtitleOf(title) : "Movies, series and anime";
  const synopsis = title?.description ? clamp(title.description, 190) : "";
  const footerNote = title
    ? "Watch on CINEMAX · Platform names and logos belong to their respective owners"
    : "Movies, series and anime · Streaming-platform names and logos belong to their owners";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: "#030303",
        color: "#f6f6f6",
        fontFamily: "Outfit, sans-serif",
      }}
    >
      {assets.backdrop && (
        <img
          src={assets.backdrop}
          alt=""
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover", opacity: 0.55 }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          backgroundImage:
            "linear-gradient(100deg, rgba(3,3,3,0.97) 0%, rgba(3,3,3,0.92) 34%, rgba(3,3,3,0.45) 62%, rgba(3,3,3,0.72) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flex: 1,
          padding: 56,
          gap: 44,
          alignItems: "center",
        }}
      >
        {assets.poster && (
          <img
            src={assets.poster}
            alt=""
            width={300}
            height={450}
            style={{
              width: 300,
              height: 450,
              objectFit: "cover",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.16)",
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
            {assets.emblem && <img src={assets.emblem} alt="" width={54} height={54} style={{ width: 54, height: 54 }} />}
            <div style={{ display: "flex", fontSize: 30, letterSpacing: 2, color: "#f4f4f4" }}>CINEMAX</div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: heading.length > 30 ? 60 : 76,
              lineHeight: 1.06,
              letterSpacing: -2,
              color: "#ffffff",
              maxWidth: 760,
            }}
          >
            {clamp(heading, 64)}
          </div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 27, color: "#cfcfcf" }}>{subtitle}</div>
          {synopsis && (
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 23,
                lineHeight: 1.45,
                color: "#a9a9a9",
                maxWidth: 720,
              }}
            >
              {synopsis}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginTop: 30,
              paddingTop: 14,
              paddingBottom: 14,
              paddingLeft: 28,
              paddingRight: 28,
              borderRadius: 999,
              backgroundColor: "#f4f4f4",
              color: "#070707",
              fontSize: 24,
            }}
          >
            {title ? "Watch on CINEMAX" : "Explore CINEMAX"}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          paddingLeft: 56,
          paddingRight: 56,
          paddingBottom: 30,
          fontSize: 19,
          color: "#8b8b8b",
        }}
      >
        {footerNote}
      </div>
    </div>
  );
}
