import { expect, test } from "@playwright/test";
import { resolveShareLink } from "../src/lib/providers/registry";
import { hasPlayerSettings, preservePlayerSettings } from "../src/lib/providers/url";

function playbackSource(rawUrl: string): URL {
  const result = resolveShareLink(rawUrl);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  expect(result.playback.strategy).toBe("embed");
  if (result.playback.strategy !== "embed") throw new Error("Expected an official provider embed");
  return new URL(result.playback.src);
}

test("Vidy-shaped movie URLs retain safe player settings when a page publishes its iframe", () => {
  const pageUrl = new URL("https://www.vidy.st/movie/315162?color=B72CDD&autoplay=true&token=do-not-copy");
  expect(hasPlayerSettings(pageUrl)).toBe(true);

  const iframeUrl = new URL(preservePlayerSettings("https://www.vidy.st/embed/315162", pageUrl));
  expect(iframeUrl.pathname).toBe("/embed/315162");
  expect(iframeUrl.searchParams.get("color")).toBe("B72CDD");
  expect(iframeUrl.searchParams.get("autoplay")).toBe("true");
  expect(iframeUrl.searchParams.has("token")).toBe(false);
});

test("official YouTube and Vimeo embed URLs keep their original query settings", () => {
  const youtube = playbackSource("https://www.youtube.com/embed/dQw4w9WgXcQ?color=B72CDD&autoplay=true&start=42");
  expect(youtube.host).toBe("www.youtube.com");
  expect(youtube.pathname).toBe("/embed/dQw4w9WgXcQ");
  expect(youtube.searchParams.get("color")).toBe("B72CDD");
  expect(youtube.searchParams.get("autoplay")).toBe("true");
  expect(youtube.searchParams.get("start")).toBe("42");

  const vimeo = playbackSource("https://player.vimeo.com/video/123456789?h=private-hash&color=B72CDD&autoplay=true");
  expect(vimeo.host).toBe("player.vimeo.com");
  expect(vimeo.searchParams.get("h")).toBe("private-hash");
  expect(vimeo.searchParams.get("color")).toBe("B72CDD");
  expect(vimeo.searchParams.get("autoplay")).toBe("true");
});

test("share URLs retain settings when adapted to official provider players", () => {
  const vimeo = playbackSource("https://vimeo.com/123456789?h=private-hash&color=B72CDD&autoplay=false");
  expect(vimeo.host).toBe("player.vimeo.com");
  expect(vimeo.pathname).toBe("/video/123456789");
  expect(vimeo.searchParams.get("h")).toBe("private-hash");
  expect(vimeo.searchParams.get("color")).toBe("B72CDD");
  expect(vimeo.searchParams.get("autoplay")).toBe("false");

  const dailymotion = playbackSource("https://www.dailymotion.com/video/x8fixture?color=B72CDD&autoplay=false");
  expect(dailymotion.pathname).toBe("/embed/video/x8fixture");
  expect(dailymotion.searchParams.get("color")).toBe("B72CDD");
  expect(dailymotion.searchParams.get("autoplay")).toBe("false");
});
