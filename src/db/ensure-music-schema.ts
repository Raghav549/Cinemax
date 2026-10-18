import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/** Additive MiLey tables. Legacy movie tables are deliberately left untouched. */
const statements = [
  `CREATE TABLE IF NOT EXISTS "miley_users" (
    id serial PRIMARY KEY, email varchar(320) NOT NULL UNIQUE, username varchar(30) NOT NULL UNIQUE,
    display_name varchar(100) NOT NULL, password_hash text NOT NULL, birth_date date NOT NULL,
    gender varchar(40) NOT NULL DEFAULT 'prefer_not_to_say', avatar_url text NOT NULL DEFAULT '', bio varchar(280) NOT NULL DEFAULT '',
    email_verified boolean NOT NULL DEFAULT false, is_private boolean NOT NULL DEFAULT false,
    recommendations_enabled boolean NOT NULL DEFAULT true, history_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
    CONSTRAINT miley_users_username_check CHECK (username ~ '^[a-z0-9_]{3,30}$')
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_sessions" (
    id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_auth_tokens" (
    id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE, purpose varchar(32) NOT NULL,
    expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT miley_auth_tokens_purpose_check CHECK (purpose IN ('verify_email','reset_password'))
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_auth_limits" (
    limit_key char(64) PRIMARY KEY, failures integer NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_channels" (
    id serial PRIMARY KEY, owner_id integer NOT NULL UNIQUE REFERENCES miley_users(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL, handle varchar(32) NOT NULL UNIQUE, image_url text NOT NULL DEFAULT '', banner_url text NOT NULL DEFAULT '',
    description varchar(1000) NOT NULL DEFAULT '', links jsonb NOT NULL DEFAULT '[]'::jsonb,
    language varchar(80) NOT NULL DEFAULT '', genre varchar(80) NOT NULL DEFAULT '',
    visibility varchar(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT miley_channels_handle_check CHECK (handle ~ '^[a-z0-9_]{3,32}$')
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_tracks" (
    id serial PRIMARY KEY, owner_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    channel_id integer NOT NULL REFERENCES miley_channels(id) ON DELETE CASCADE,
    title varchar(200) NOT NULL, artist varchar(160) NOT NULL, album_title varchar(200) NOT NULL DEFAULT '',
    description varchar(1000) NOT NULL DEFAULT '', duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    artwork_url text NOT NULL DEFAULT '', object_key text NOT NULL, content_type varchar(100) NOT NULL,
    file_size bigint NOT NULL CHECK (file_size > 0), sha256 char(64) NOT NULL, lyrics text NOT NULL DEFAULT '',
    language varchar(80) NOT NULL DEFAULT '', genre varchar(80) NOT NULL DEFAULT '', release_year integer,
    visibility varchar(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
    rights_confirmed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
    UNIQUE(owner_id, sha256)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_albums" (
    id serial PRIMARY KEY, owner_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    channel_id integer NOT NULL REFERENCES miley_channels(id) ON DELETE CASCADE,
    title varchar(200) NOT NULL, description varchar(1000) NOT NULL DEFAULT '', artwork_url text NOT NULL DEFAULT '',
    release_date date, genre varchar(80) NOT NULL DEFAULT '', language varchar(80) NOT NULL DEFAULT '',
    visibility varchar(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_album_tracks" (
    album_id integer NOT NULL REFERENCES miley_albums(id) ON DELETE CASCADE,
    track_id integer NOT NULL REFERENCES miley_tracks(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0, added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(album_id, track_id), UNIQUE(album_id, position)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_playlists" (
    id serial PRIMARY KEY, owner_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    title varchar(120) NOT NULL, description varchar(1000) NOT NULL DEFAULT '', artwork_url text NOT NULL DEFAULT '',
    visibility varchar(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_playlist_tracks" (
    playlist_id integer NOT NULL REFERENCES miley_playlists(id) ON DELETE CASCADE,
    track_id integer NOT NULL REFERENCES miley_tracks(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0, added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(playlist_id, track_id), UNIQUE(playlist_id, position)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_favorites" (
    user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    track_id integer NOT NULL REFERENCES miley_tracks(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, track_id)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_history" (
    id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    track_id integer NOT NULL REFERENCES miley_tracks(id) ON DELETE CASCADE,
    position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0), played_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_follows" (
    follower_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    followed_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(follower_id, followed_id),
    CONSTRAINT miley_follows_no_self_check CHECK (follower_id <> followed_id)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_follow_requests" (
    id serial PRIMARY KEY, requester_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    target_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(requester_id, target_id), CONSTRAINT miley_follow_requests_no_self_check CHECK (requester_id <> target_id)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_conversations" (
    id serial PRIMARY KEY, user_a integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    user_b integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_a, user_b),
    CONSTRAINT miley_conversations_sorted_pair_check CHECK (user_a < user_b)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_direct_messages" (
    id serial PRIMARY KEY, conversation_id integer NOT NULL REFERENCES miley_conversations(id) ON DELETE CASCADE,
    sender_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    body varchar(2000) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_channel_subscriptions" (
    user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    channel_id integer NOT NULL REFERENCES miley_channels(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, channel_id)
  )`,
  `CREATE INDEX IF NOT EXISTS "miley_conversations_user_a_idx" ON miley_conversations(user_a, last_message_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_conversations_user_b_idx" ON miley_conversations(user_b, last_message_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_direct_messages_conversation_date_idx" ON miley_direct_messages(conversation_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_direct_messages_sender_date_idx" ON miley_direct_messages(sender_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS "miley_notes" (
    id serial PRIMARY KEY, user_id integer NOT NULL UNIQUE REFERENCES miley_users(id) ON DELETE CASCADE,
    track_id integer NOT NULL REFERENCES miley_tracks(id) ON DELETE CASCADE,
    caption varchar(100) NOT NULL DEFAULT '', expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_user_settings" (
    user_id integer PRIMARY KEY REFERENCES miley_users(id) ON DELETE CASCADE,
    playback jsonb NOT NULL DEFAULT '{}'::jsonb, notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
    accessibility jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_blocks" (
    blocker_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    blocked_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(blocker_id, blocked_id),
    CONSTRAINT miley_blocks_no_self_check CHECK (blocker_id <> blocked_id)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_reports" (
    id serial PRIMARY KEY, reporter_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    target_type varchar(32) NOT NULL, target_id integer NOT NULL, reason varchar(1000) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_images" (
    id serial PRIMARY KEY, owner_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    purpose varchar(24) NOT NULL CHECK (purpose IN ('avatar','channel_profile','channel_banner','artwork')),
    content_type varchar(40) NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    image_data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_uploads" (
    id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    object_key text NOT NULL UNIQUE, original_name varchar(240) NOT NULL, content_type varchar(100) NOT NULL,
    expected_size bigint NOT NULL CHECK (expected_size > 0), claimed_sha256 char(64) NOT NULL,
    track_metadata jsonb NOT NULL, expires_at timestamptz NOT NULL,
    completed_track_id integer REFERENCES miley_tracks(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_notifications" (
    id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    actor_id integer REFERENCES miley_users(id) ON DELETE SET NULL, kind varchar(40) NOT NULL,
    resource_id integer, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_podcasts" (
    id serial PRIMARY KEY, feed_url text NOT NULL UNIQUE, title varchar(240) NOT NULL,
    description text NOT NULL DEFAULT '', artwork_url text NOT NULL DEFAULT '', language varchar(80) NOT NULL DEFAULT '',
    owner_id integer REFERENCES miley_users(id) ON DELETE SET NULL,
    distribution_authorized boolean NOT NULL DEFAULT false, rights_reviewed_at timestamptz,
    imported_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT miley_podcasts_authorization_review_check CHECK (NOT distribution_authorized OR rights_reviewed_at IS NOT NULL)
  )`,
  `ALTER TABLE miley_podcasts ADD COLUMN IF NOT EXISTS distribution_authorized boolean NOT NULL DEFAULT false`,
  `ALTER TABLE miley_podcasts ADD COLUMN IF NOT EXISTS rights_reviewed_at timestamptz`,
  `DO $miley$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'miley_podcasts_authorization_review_check' AND conrelid = 'miley_podcasts'::regclass) THEN
      ALTER TABLE miley_podcasts ADD CONSTRAINT miley_podcasts_authorization_review_check
      CHECK (NOT distribution_authorized OR rights_reviewed_at IS NOT NULL) NOT VALID;
    END IF;
  END $miley$`,
  `CREATE INDEX IF NOT EXISTS "miley_podcasts_authorized_idx" ON miley_podcasts(distribution_authorized, imported_at DESC)`,
  `CREATE TABLE IF NOT EXISTS "miley_podcast_episodes" (
    id serial PRIMARY KEY, podcast_id integer NOT NULL REFERENCES miley_podcasts(id) ON DELETE CASCADE,
    external_id varchar(500) NOT NULL, title varchar(240) NOT NULL, description text NOT NULL DEFAULT '',
    audio_url text NOT NULL, artwork_url text NOT NULL DEFAULT '', duration_seconds integer,
    published_at timestamptz, UNIQUE(podcast_id, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_podcast_subscriptions" (
    user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    podcast_id integer NOT NULL REFERENCES miley_podcasts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, podcast_id)
  )`,
  `CREATE TABLE IF NOT EXISTS "miley_podcast_history" (
    user_id integer NOT NULL REFERENCES miley_users(id) ON DELETE CASCADE,
    episode_id integer NOT NULL REFERENCES miley_podcast_episodes(id) ON DELETE CASCADE,
    position_seconds integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, episode_id)
  )`,
  `CREATE INDEX IF NOT EXISTS "miley_sessions_user_idx" ON miley_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS "miley_auth_tokens_user_idx" ON miley_auth_tokens(user_id)`,
  `CREATE INDEX IF NOT EXISTS "miley_channels_created_idx" ON miley_channels(created_at)`,
  `CREATE INDEX IF NOT EXISTS "miley_tracks_channel_created_idx" ON miley_tracks(channel_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_tracks_public_created_idx" ON miley_tracks(visibility, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_albums_owner_idx" ON miley_albums(owner_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_playlists_owner_idx" ON miley_playlists(owner_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_history_user_played_idx" ON miley_history(user_id, played_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_follows_followed_idx" ON miley_follows(followed_id)`,
  `CREATE INDEX IF NOT EXISTS "miley_follow_requests_target_idx" ON miley_follow_requests(target_id, status)`,
  `CREATE INDEX IF NOT EXISTS "miley_channel_subscriptions_channel_idx" ON miley_channel_subscriptions(channel_id)`,
  `CREATE INDEX IF NOT EXISTS "miley_notes_expiry_idx" ON miley_notes(expires_at)`,
  `CREATE INDEX IF NOT EXISTS "miley_images_owner_idx" ON miley_images(owner_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_uploads_user_idx" ON miley_uploads(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_notifications_user_date_idx" ON miley_notifications(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS "miley_reports_target_idx" ON miley_reports(target_type, target_id)`,
];

let schemaPromise: Promise<void> | null = null;

export function ensureMusicSchema(force = false): Promise<void> {
  if (!force && process.env.MILEY_SCHEMA_AUTO_CREATE === "false") return Promise.resolve();
  if (!schemaPromise || force) {
    schemaPromise = (async () => {
      const db = getDb();
      for (const statement of statements) await db.execute(sql.raw(statement));
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
