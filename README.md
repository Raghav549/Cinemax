# CineMax

Movie streaming PWA built with Next.js 16, PostgreSQL and Drizzle ORM.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000. On first visit the app creates the database tables and seeds demo data automatically.

## Deploy to Vercel

1. **Create a PostgreSQL database**: Neon (Vercel → Storage → Neon), Supabase, Railway, etc. Copy its connection string.
2. **Import the repo** in Vercel. The framework preset should be **Next.js**. Leave the build command (`next build`) and output directory at their defaults.
3. **Add environment variables** (Project → Settings → Environment Variables, for Production *and* Preview):

   | Name             | Value                                                    |
   | ---------------- | -------------------------------------------------------- |
   | `DATABASE_URL`   | your Postgres connection string                          |
   | `JWT_SECRET`     | a long random string (`openssl rand -base64 32`)         |
   | `ADMIN_EMAIL`    | admin login email for `/gate-keeper`                     |
   | `ADMIN_PASSWORD` | admin login password                                     |

   If you used Vercel's Neon integration, `POSTGRES_URL` / `DATABASE_URL` is added for you. Both names work.
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.
5. Open the site. The tables are created and demo data is seeded on first visit.
   You can also trigger it manually: `curl -X POST https://YOUR-APP.vercel.app/api/seed`.
6. Check the database connection at `https://YOUR-APP.vercel.app/api/health`. It should return `{"ok":true}`.

### Optional: manage the schema with Drizzle

```bash
DATABASE_URL="postgresql://..." npm run db:push    # create/update tables
DATABASE_URL="postgresql://..." npm run db:studio  # browse data
```

## Existing data, schema drift and diagnostics

The app never assumes your database was created by this exact revision. On the
first request of each server process it reconciles the schema **without dropping
anything**:

| Situation                                       | What happens                                              |
| ----------------------------------------------- | --------------------------------------------------------- |
| Table missing                                   | created from `src/db/schema.ts`                           |
| Column the mapping expects is missing           | added (`ADD COLUMN IF NOT EXISTS`)                        |
| Column exists under an older name (`poster`)    | renamed onto the expected name (`poster_url`), data kept  |
| Old and new column both exist                   | values copied into the new column where it is empty       |

The old names it recognises live in `src/db/table-map.ts`. Nothing is deleted and
no data is rewritten unless the target column is empty.

`GET /api/health` reports the whole chain instead of just the TCP connection:

```jsonc
{
  "ok": true,
  "connection": { "host": "ep-…neon.tech", "database": "neondb", "ssl": true, "source": "DATABASE_URL" },
  "tables": { "movies": { "created": false, "added": ["featured"], "renamed": [{ "from": "poster", "to": "poster_url" }], "backfilled": [], "skipped": [] } },
  "counts": { "movies": 32, "slides": 3, "categories": 12 }
}
```

When `ok` is `false`, `stage` says which step failed (`connect`, `schema` or
`read`) and `error` carries the Postgres message — e.g.
`column "poster_url" of relation "movies" does not exist`. The admin panel shows
the same message in a banner rather than rendering an empty library.

## Playback and authorized magnet sources

Cinemax keeps direct MP4/WebM URLs, HLS (`.m3u8`), YouTube, and Vimeo playback. HLS uses `hls.js` on compatible browsers for adaptive buffering and selectable renditions; Safari/iOS can use native HLS. The player also supports WebVTT subtitle tracks, speed and picture controls, keyboard shortcuts, recoverable network/media errors, and a private per-device resume marker (stored locally in the browser).

Magnet sources are an opt-in path for **content Cinemax is authorized to distribute**:

1. In `/gate-keeper`, paste the licensed `magnet:?xt=urn:btih:…` or v2 magnet URI into a movie’s Playback source field.
2. Confirm the public distribution-rights checkbox. The API rejects magnet sources without this attestation, and the public catalogue never returns the magnet itself.
3. Deploy a private, persistent torrent streaming gateway and set `TORRENT_STREAMING_ENABLED=true`, `TORRENT_GATEWAY_URL`, and a long random `TORRENT_GATEWAY_TOKEN`. The gateway must stream the selected video file as soon as pieces are available; it must not require the viewer to wait for the whole torrent.

The Cinemax `/api/stream/{movieId}` Node route is the public playback endpoint and security boundary: it only resolves magnets already saved to an authorized movie, keeps the source server-side, forwards byte-range requests for seeking/buffering, and streams the gateway response through without buffering the whole file in Next.js. It returns `503` when magnet streaming is not configured. The gateway must be private, use HTTPS outside localhost, validate the bearer token, choose a video file only, support `GET`/`HEAD` and HTTP `Range` (including `206`, `Content-Range`, and `416`), and return a streaming response with `Content-Length`/`Accept-Ranges` where available. The private `X-Cinemax-Authorized-Magnet` header contains the approved source; do not log that header or expose the gateway directly to browsers.

**Deployment note:** the torrent engine is intentionally a separately operated persistent service rather than a torrent client embedded in a serverless Next.js function. Vercel can host the Cinemax UI/API adapter, but it cannot host the always-on peer discovery and stream lifecycle needed by a torrent engine. If you do not operate an authorized gateway, leave `TORRENT_STREAMING_ENABLED=false`; direct video and HLS playback are unaffected. The app does not supply, index, seed, or recommend any torrent content.

## Scripts

| Script              | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `npm run dev`       | Start dev server                                                   |
| `npm run build`     | Production build                                                   |
| `npm run lint`      | ESLint                                                             |
| `npm run typecheck` | TypeScript check                                                   |
| `npm run db:push`   | Push Drizzle schema to database                                    |
| `npm run verify:api`| End-to-end check of every admin/public API route (see below)        |

### Verifying a deployment

`scripts/verify-admin.mjs` logs in, then exercises every read and every
add/edit/delete path (movies, slides, categories, watchlist) plus the auth and
validation guards. It creates its own rows and deletes them again, so it is safe
to run against a database that already holds data.

```bash
# against a local dev server
npm run dev &
BASE_URL=http://localhost:3000 ADMIN_EMAIL=admin@cinemax.com ADMIN_PASSWORD=... npm run verify:api

# against a deployment
BASE_URL=https://your-app.vercel.app ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run verify:api
```

It prints one line per check and exits non-zero if anything fails.
