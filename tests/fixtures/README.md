# Playback verification fixtures

These are tiny, original synthetic test clips (flat navy and violet rectangles),
not films or runtime catalogue data. They are used only by intercepted
`/__e2e__/...` requests in Playwright. The tests create real movie rows through
the existing authenticated API and remove them in `finally` blocks.

- `prism-test.webm`: 90-second, 320×180, silent VP9 clip for direct playback/resume.
- `prism-master.m3u8`, `prism-stream*.m3u8`, `prism-segment-*.ts` and
  `prism-360-segment-*.ts`: 18-second, silent H.264 HLS fixture with two
  genuinely distinct renditions for hls.js quality-selection verification:
  320×180 (the original three segments) and 640×360 (separate, scaled and
  re-encoded segments). The master manifest's resolution and codec metadata
  matches those actual streams; it does not advertise invented levels.
- `prism-subtitles.vtt`: original English WebVTT captions for subtitle tests.

The original synthetic clip was generated with FFmpeg's `color` and
`drawbox` filters; the 640×360 test rendition was then scaled and H.264
re-encoded from it with FFmpeg. No third-party media,
licensed catalogue artwork, database snapshots or credentials are committed.
