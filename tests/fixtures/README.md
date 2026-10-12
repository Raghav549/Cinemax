# Playback verification fixtures

These are tiny, original synthetic test clips (flat navy and violet rectangles),
not films or runtime catalogue data. They are used only by intercepted
`/__e2e__/...` requests in Playwright. The tests create real movie rows through
the existing authenticated API and remove them in `finally` blocks.

- `prism-test.webm`: 90-second, 320×180, silent VP9 clip for direct playback/resume.
- `prism-master.m3u8`, `prism-stream.m3u8`, `prism-segment-*.ts`: 18-second,
  320×180, silent H.264 HLS stream for hls.js/rendition verification.
- `prism-subtitles.vtt`: original English WebVTT captions for subtitle tests.

Generated with FFmpeg's `color` and `drawbox` filters. No third-party media,
licensed catalogue artwork, database snapshots or credentials are committed.
