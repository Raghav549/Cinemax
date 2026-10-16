// Local test provider (NOT a real streaming site). Serves:
//  - media files (range-capable, CORS on by default) and HLS/DASH
//  - watch-page fixtures modelled on the shapes the resolver must handle
import http from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import { join, normalize, extname } from "node:path";

// Media is generated locally (not committed); point FIXTURE_ROOT at a folder with media/ and HLS/DASH files.
const ROOT = process.env.FIXTURE_ROOT || new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const HLS_JS = new URL("../../node_modules/hls.js/dist/hls.min.js", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8900);
const TYPES = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".m3u8": "application/vnd.apple.mpegurl",
  ".mpd": "application/dash+xml", ".m4s": "video/iso.segment", ".ts": "video/mp2t",
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".vtt": "text/vtt",
};

const hits = [];

function page(title, body, extraHead = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${extraHead}</head><body>${body}</body></html>`;
}

// JS-only player, bingr-like: the media URL only exists after an API call.
const jsOnlyWatch = page("Mock Watch Page · JS player", `
  <main><h1>Mock Movie</h1><div id="player"><p>Loading player…</p></div></main>
  <script>
    (async () => {
      const r = await fetch("/api/stream/1058424");
      const data = await r.json();
      const video = document.createElement("video");
      video.controls = true; video.muted = true; video.autoplay = true; video.playsInline = true;
      video.style.width = "100%";
      document.getElementById("player").replaceChildren(video);
      const s = document.createElement("script"); s.src = "/vendor/hls.min.js";
      s.onload = () => { const h = new Hls(); h.loadSource(data.url); h.attachMedia(video); h.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {})); };
      document.head.appendChild(s);
    })();
  </script>`);

const staticWatch = page("Static video page", `<main><video controls muted width="640"><source src="/media/clip.webm" type="video/webm"></video></main>`);
const ogWatch = page("OG video page", `<main><h1>OG page</h1></main>`,
  `<meta property="og:video" content="/media/clip.mp4"><meta property="og:video:type" content="video/mp4">`);
const iframeWatch = page("Iframe embed page", `<main><h1>Embedded</h1><iframe src="/embed/player-1" width="640" height="360" allowfullscreen></iframe></main>`);
const embedPlayer = page("Embed player", `
  <video id="v" controls muted autoplay playsinline width="640"></video>
  <script src="/vendor/hls.min.js"></script>
  <script>const v=document.getElementById('v'); const h=new Hls(); h.loadSource('/media/hls/index.m3u8'); h.attachMedia(v); h.on(Hls.Events.MANIFEST_PARSED, ()=>v.play().catch(()=>{}));</script>`);
const deniedEmbed = page("Denied embed", `<p>Refused</p>`);
const deniedWatch = page("Denied watch page", `<p>No media here</p>`);
const noMediaWatch = page("Plain article", `<main><p>Just text, nothing to play here.</p></main>`);

const routes = {
  "/watch/movie/1058424": { body: jsOnlyWatch, type: "text/html; charset=utf-8" },
  "/watch/static-video": { body: staticWatch, type: "text/html; charset=utf-8" },
  "/watch/og-video": { body: ogWatch, type: "text/html; charset=utf-8" },
  "/watch/iframe-embed": { body: iframeWatch, type: "text/html; charset=utf-8" },
  "/embed/player-1": { body: embedPlayer, type: "text/html; charset=utf-8" },
  "/embed/denied": { body: deniedEmbed, type: "text/html; charset=utf-8", headers: { "X-Frame-Options": "DENY" } },
  "/watch/denied": { body: deniedWatch, type: "text/html; charset=utf-8", headers: { "X-Frame-Options": "DENY" } },
  "/watch/article": { body: noMediaWatch, type: "text/html; charset=utf-8" },
  "/watch/iframe-denied": { body: page("Iframe denied", `<iframe src="/embed/denied"></iframe>`), type: "text/html; charset=utf-8" },
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path; try { path = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end("bad path"); }
  hits.push({ t: Date.now(), method: req.method, path, range: req.headers.range || null });
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length, Content-Range" };

  if (path === "/__hits") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(hits.slice(-500)));
  }
  if (path === "/__reset") { hits.length = 0; res.writeHead(204); return res.end(); }
  if (path === "/vendor/hls.min.js") {
    res.writeHead(200, { "Content-Type": "application/javascript", ...cors });
    return createReadStream(HLS_JS).pipe(res);
  }
  if (path === "/watch/slow") {
    // Slow provider: the resolver is still searching for media for a few seconds (loading-state check).
    return setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...cors });
      res.end(staticWatch);
    }, 6000);
  }
  if (path === "/watch/redirect") {
    res.writeHead(302, { Location: "/watch/static-video" });
    return res.end();
  }
  if (path === "/api/stream/1058424") {
    res.writeHead(200, { "Content-Type": "application/json", ...cors });
    return res.end(JSON.stringify({ url: "/media/hls/index.m3u8" }));
  }
  if (path.startsWith("/nocors/")) {
    // Same media without CORS headers: exercises the hls.js/dash.js CORS failure path.
    return serveFile(join(ROOT, "media", path.slice("/nocors/".length)), res, {});
  }
  if (path.startsWith("/media/")) return serveFile(join(ROOT, path), res, cors);
  if (routes[path]) {
    const r = routes[path];
    res.writeHead(200, { "Content-Type": r.type, "Cache-Control": "no-store", ...(r.headers || {}), ...cors });
    return res.end(r.body);
  }
  if (path === "/mock/gone") { res.writeHead(404, { "Content-Type": "text/html" }); return res.end("<h1>Gone</h1>"); }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

function serveFile(file, res, headers) {
  const safe = normalize(file);
  if (!safe.startsWith(ROOT) && !safe.startsWith(join(ROOT, "media"))) { res.writeHead(403); return res.end(); }
  if (!existsSync(safe) || !statSync(safe).isFile()) { res.writeHead(404, headers); return res.end("missing"); }
  const size = statSync(safe).size;
  const type = TYPES[extname(safe)] || "application/octet-stream";
  const range = res.req?.headers?.range;
  const base = { "Accept-Ranges": "bytes", "Content-Type": type, ...headers };
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return createReadStream(safe, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, "Content-Length": size });
  return createReadStream(safe).pipe(res);
}

server.listen(PORT, "0.0.0.0", () => console.log(`mock provider on ${PORT}`));
