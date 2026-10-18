# MiLey

MiLey is a music and social platform built in the existing Next.js 16 / React 19 / PostgreSQL project. It replaces the public CinemaX movie-browsing experience while retaining the useful application, database, and deployment infrastructure. No tracks, artists, podcasts, episodes, or creator statistics are seeded or invented.

## What is implemented

- **Accounts:** two-step email/password registration, server-side age/password validation, bcrypt password hashes, hashed one-time verification/reset tokens, HTTP-only session cookies, rate-limited password sign-in, password change, and account deletion. Account deletion removes owned and pending-upload objects before deleting account rows; if storage is unavailable or cleanup fails, deletion stops and the account remains available for retry. Email delivery uses the Resend HTTP API only when configured; there is no Google sign-in or SMTP flow.
- **Music and creator tools:** database-backed track catalog, favorites, history, playlists, albums, creator channels, channel subscriptions, and direct uploads. Audio uploads are limited to 60 MB, sent to private S3-compatible storage using a short-lived signed PUT URL, and checked server-side for declared size, supported file signature, and SHA-256 before a track is created. Public playback requires a public track, a public channel, and the uploader's rights attestation.
- **Social:** profiles, public/private account controls, follow requests, blocks/reports, in-app notifications and preferences, and music notes. Notes require mutual follows and a public rights-confirmed track. Direct messages require verified email, mutual follows, and no block; messages are stored by the service and are **not end-to-end encrypted**.
- **Podcasts:** the public API and UI only return shows explicitly marked distribution-authorized and rights-reviewed. No podcast importer or catalog data is included, so the honest empty state is expected until an operator supplies and reviews authorized content.
- **Interface and privacy:** responsive MiLey navigation, animated introductory splash, dark/charcoal/soft-pink brand, mostly white messaging, reduced-motion styles, accessible page landmarks and labels, legal/community pages, a small offline fallback, and a service worker that never caches API responses or user media.

The web player uses the browser's audio element and Media Session API where supported. Native Android background playback and OS media controls are **not implemented or verified** in this migration; see the platform note below.

## Local development

Requirements: Node.js 20.9+, npm, and PostgreSQL. Copy the sample environment file and configure at least the database URL:

```bash
npm ci
cp .env.example .env.local
# Edit .env.local and set DATABASE_URL.
npm run dev
```

Open <http://localhost:3000>. With the default `MILEY_SCHEMA_AUTO_CREATE=true` behavior (the default when unset), the first database-backed request creates the additive MiLey tables. The database role therefore needs schema `CREATE` privileges for local first boot. Nothing is seeded; an empty catalog remains empty.

Before production, prefer applying the schema in a deployment/migration step, then set `MILEY_SCHEMA_AUTO_CREATE=false` so web instances do not attempt runtime DDL. The canonical Drizzle schema includes both the retained legacy tables and MiLey tables:

```bash
DATABASE_URL="postgresql://..." npm run db:push
```

Review Drizzle's proposed changes before applying them to an existing database. `src/db/ensure-music-schema.ts` remains an additive runtime bootstrap for local/easy setup; no production migration has been run by this repository checkout.

## Environment variables

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | Accounts, catalog, social, settings | PostgreSQL connection string. `DATABASE_URL` takes precedence. |
| `MILEY_SCHEMA_AUTO_CREATE` | Optional schema mode | Defaults to enabled. Set to `false` only after applying the Drizzle schema; runtime then assumes tables already exist. |
| `RESEND_API_KEY` | Verification/reset email | Resend API key. Without it, delivery is not attempted; production does not return a development token. |
| `MILEY_MAIL_FROM` | Verification/reset email | Verified sender, e.g. `MiLey <accounts@your-domain.example>`. |
| `MILEY_APP_URL` | Email links | Canonical HTTPS app origin used to build links. `NEXT_PUBLIC_APP_URL` is a fallback. |
| `S3_ENDPOINT` | Audio uploads and playback | HTTPS S3-compatible endpoint. `http://localhost` is allowed only for local development. |
| `S3_BUCKET` | Audio uploads and playback | Private bucket name; do not enable public bucket access. |
| `S3_REGION` | Audio uploads and playback | S3 signing region; use the provider's region (`auto` for compatible services that require it). |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Audio uploads and playback | Server-only credentials. Never prefix these with `NEXT_PUBLIC_`. |
| `MILEY_SCHEMA_AUTO_CREATE=false` | Production least-privilege rollout | Use only after the database schema has been applied. |
| `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Legacy CinemaX `/gate-keeper` only | These are not MiLey account credentials and are not used by MiLey's email/password auth. Keep them out of public client variables. |

For S3-compatible direct browser uploads, configure bucket CORS for the exact deployed MiLey origin and `PUT`; allow the `Content-Type` request header. Keep the bucket private: the server issues short-lived signed upload and playback URLs. Resend requires a verified sending domain/from address. Do not commit `.env.local` or credentials.

## Production rollout checklist

1. Provision PostgreSQL, apply/review the Drizzle schema, and verify `GET /api/health` reports a healthy connection.
2. Configure Resend and a verified sender before allowing public registration; confirm verification and reset messages arrive at real addresses.
3. Configure private S3-compatible storage and CORS before enabling creator uploads. Verify signed PUT, HEAD, GET, and DELETE with a test account and a rights-cleared test recording.
4. Set `MILEY_APP_URL` to the HTTPS production origin. Use HTTPS so session cookies are secure.
5. Review legal and moderation requirements for the jurisdictions where the service will operate. The repository intentionally does not invent an operator identity, support address, takedown agent, or legal advice.
6. Keep podcast content absent unless distribution permission has been reviewed and the catalog entry has both `distribution_authorized=true` and a non-null `rights_reviewed_at` value. This repo does not include an ingestion workflow.
7. Test registration, email verification/reset, privacy and block rules, message/note permissions, image access, uploads, playback, deletion, backups, and retention against the actual configured services before launch.

## Validation and known limitations

Validation run in this workspace:

- `npm run typecheck` — passed.
- `npm run lint` — passed with no warnings.
- `npm run build` — passed; Next.js generated the production route manifest.
- HTTP smoke checks — MiLey pages returned 200 and legacy movie pages redirected to `/explore` or `/library`; auth session returned an anonymous session as expected.
- Database-backed API checks — **blocked/unavailable** because `DATABASE_URL` is not configured here. `/api/health` returned 500 with the explicit missing-variable message; music/podcast/catalog endpoints returned service errors rather than mock content. Registration, Postgres persistence, email delivery, image storage, S3 upload/playback, and account deletion were not end-to-end tested.
- Playwright browser tests — **not run**: this environment has no installed Chromium executable. The existing Playwright suite under `tests/` still targets the retired CinemaX film UI and is not a MiLey acceptance suite. Install a supported browser and add/run MiLey-specific browser coverage before release.

`npm audit` reports 9 findings in the full dependency tree (4 moderate, 5 high); `npm audit --omit=dev` reports 0 production dependency findings. The reported issues are in development tooling such as Drizzle Kit and Next ESLint tooling; review and update them through the normal lockfile review process before production. No blanket `npm audit fix` was applied.

Additional constraints to plan for:

- Images are byte-size/type/signature checked and privacy-gated, but no image resizing, EXIF stripping, malware scanning, or content moderation service is integrated.
- Audio rights are an uploader attestation, not independently established or licensed by MiLey; a staffed report/takedown process is not included.
- No native Android MediaSession/background audio integration was added. The shipped Android project still identifies as CinemaX, points at the old `cinemax-orpin.vercel.app` deployment, and has not been validated against MiLey.
- The retained CinemaX database/API/admin code is not the MiLey product surface. `/categories`, `/category/*`, `/movie/*`, `/search`, and `/watchlist` are compatibility redirects; legacy APIs and `/gate-keeper` have not been removed or rebranded.

## Useful commands

```bash
npm run dev          # Local development
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run build        # Production build
npm run db:push      # Apply the Drizzle schema (review first)
npm run test:ui      # Existing legacy CinemaX Playwright suite; not MiLey coverage
```

## Repository map

- `src/app/api/auth/` — account registration, login, verification, password reset, sessions.
- `src/app/api/music/` — tracks, uploads, playback, favorites, history, albums, playlists, channels, settings.
- `src/app/api/social/` — profiles, follows, blocks/reports, notes, messages, notifications.
- `src/db/music-schema.ts`, `src/db/miley-messages-schema.ts` — additive PostgreSQL/Drizzle tables.
- `src/db/ensure-music-schema.ts` — additive runtime DDL for easy setup.
- `src/lib/storage/s3.ts` — server-only S3 SigV4 signing, object verification, and deletion.
- `src/components/miley/` — MiLey UI, music player, collection and social screens.
- `public/brand/`, `public/manifest.json`, `public/sw.js` — MiLey PWA branding and offline shell.
- `public/licenses/` — included font/dependency license notices.
