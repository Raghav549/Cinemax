import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  boolean,
  customType,
  char,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const users = pgTable("miley_users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  username: varchar("username", { length: 30 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  birthDate: date("birth_date").notNull(),
  gender: varchar("gender", { length: 40 }).notNull().default("prefer_not_to_say"),
  avatarUrl: text("avatar_url").notNull().default(""),
  bio: varchar("bio", { length: 280 }).notNull().default(""),
  emailVerified: boolean("email_verified").notNull().default(false),
  isPrivate: boolean("is_private").notNull().default(false),
  recommendationsEnabled: boolean("recommendations_enabled").notNull().default(true),
  historyEnabled: boolean("history_enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("miley_users_email_unique").on(table.email),
  uniqueIndex("miley_users_username_lower_unique").on(table.username),
  index("miley_users_created_idx").on(table.createdAt),
  check("miley_users_username_check", sql`${table.username} ~ '^[a-z0-9_]{3,30}$'`),
]);

export const sessions = pgTable("miley_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("miley_sessions_hash_unique").on(table.tokenHash), index("miley_sessions_user_idx").on(table.userId)]);

export const authTokens = pgTable("miley_auth_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  purpose: varchar("purpose", { length: 32 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("miley_auth_tokens_hash_unique").on(table.tokenHash), index("miley_auth_tokens_user_idx").on(table.userId), check("miley_auth_tokens_purpose_check", sql`${table.purpose} IN ('verify_email','reset_password')`)]);

export const authLimits = pgTable("miley_auth_limits", {
  limitKey: char("limit_key", { length: 64 }).primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export const channels = pgTable("miley_channels", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  handle: varchar("handle", { length: 32 }).notNull(),
  imageUrl: text("image_url").notNull().default(""),
  bannerUrl: text("banner_url").notNull().default(""),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  links: jsonb("links").$type<string[]>().notNull().default([]),
  language: varchar("language", { length: 80 }).notNull().default(""),
  genre: varchar("genre", { length: 80 }).notNull().default(""),
  visibility: varchar("visibility", { length: 16 }).notNull().default("public"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("miley_channels_owner_unique").on(table.ownerId), uniqueIndex("miley_channels_handle_lower_unique").on(table.handle), index("miley_channels_created_idx").on(table.createdAt), check("miley_channels_handle_check", sql`${table.handle} ~ '^[a-z0-9_]{3,32}$'`), check("miley_channels_visibility_check", sql`${table.visibility} IN ('public','private')`)]);

export const tracks = pgTable("miley_tracks", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  artist: varchar("artist", { length: 160 }).notNull(),
  albumTitle: varchar("album_title", { length: 200 }).notNull().default(""),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  durationSeconds: integer("duration_seconds"),
  artworkUrl: text("artwork_url").notNull().default(""),
  objectKey: text("object_key").notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  lyrics: text("lyrics").notNull().default(""),
  language: varchar("language", { length: 80 }).notNull().default(""),
  genre: varchar("genre", { length: 80 }).notNull().default(""),
  releaseYear: integer("release_year"),
  visibility: varchar("visibility", { length: 16 }).notNull().default("private"),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [uniqueIndex("miley_tracks_owner_hash_unique").on(table.ownerId, table.sha256), index("miley_tracks_channel_created_idx").on(table.channelId, table.createdAt), index("miley_tracks_public_idx").on(table.visibility, table.createdAt), index("miley_tracks_title_idx").on(table.title), check("miley_tracks_duration_seconds_check", sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`), check("miley_tracks_file_size_check", sql`${table.fileSize} > 0`), check("miley_tracks_visibility_check", sql`${table.visibility} IN ('public','private')`)]);

export const albums = pgTable("miley_albums", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  artworkUrl: text("artwork_url").notNull().default(""),
  releaseDate: date("release_date"),
  genre: varchar("genre", { length: 80 }).notNull().default(""),
  language: varchar("language", { length: 80 }).notNull().default(""),
  visibility: varchar("visibility", { length: 16 }).notNull().default("private"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("miley_albums_owner_idx").on(table.ownerId, table.createdAt), index("miley_albums_channel_idx").on(table.channelId), check("miley_albums_visibility_check", sql`${table.visibility} IN ('private','public')`)]);

export const albumTracks = pgTable("miley_album_tracks", {
  albumId: integer("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  addedAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.albumId, table.trackId] }), uniqueIndex("miley_album_tracks_position_unique").on(table.albumId, table.position)]);

export const playlists = pgTable("miley_playlists", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  artworkUrl: text("artwork_url").notNull().default(""),
  visibility: varchar("visibility", { length: 16 }).notNull().default("private"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("miley_playlists_owner_idx").on(table.ownerId, table.createdAt), index("miley_playlists_public_idx").on(table.visibility, table.createdAt), check("miley_playlists_visibility_check", sql`${table.visibility} IN ('private','public')`)]);

export const playlistTracks = pgTable("miley_playlist_tracks", {
  playlistId: integer("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  addedAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.playlistId, table.trackId] }), uniqueIndex("miley_playlist_tracks_position_unique").on(table.playlistId, table.position), index("miley_playlist_tracks_track_idx").on(table.trackId)]);

export const favorites = pgTable("miley_favorites", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.trackId] }), index("miley_favorites_track_idx").on(table.trackId)]);

export const history = pgTable("miley_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
  positionSeconds: integer("position_seconds").notNull().default(0),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("miley_history_user_played_idx").on(table.userId, table.playedAt), index("miley_history_track_idx").on(table.trackId), check("miley_history_position_seconds_check", sql`${table.positionSeconds} >= 0`)]);

export const follows = pgTable("miley_follows", {
  followerId: integer("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followedId: integer("followed_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.followerId, table.followedId] }), index("miley_follows_followed_idx").on(table.followedId), check("miley_follows_no_self_check", sql`${table.followerId} <> ${table.followedId}`)]);

export const followRequests = pgTable("miley_follow_requests", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetId: integer("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("miley_follow_requests_pair_unique").on(table.requesterId, table.targetId), index("miley_follow_requests_target_idx").on(table.targetId, table.status), check("miley_follow_requests_status_check", sql`${table.status} IN ('pending','accepted','rejected')`), check("miley_follow_requests_no_self_check", sql`${table.requesterId} <> ${table.targetId}`)]);

export const channelSubscriptions = pgTable("miley_channel_subscriptions", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.channelId] }), index("miley_channel_subscriptions_channel_idx").on(table.channelId)]);

export const notes = pgTable("miley_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
  caption: varchar("caption", { length: 100 }).notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("miley_notes_user_unique").on(table.userId), index("miley_notes_expiry_idx").on(table.expiresAt)]);

export const userSettings = pgTable("miley_user_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  playback: jsonb("playback").$type<Record<string, unknown>>().notNull().default({}),
  notifications: jsonb("notifications").$type<Record<string, unknown>>().notNull().default({}),
  accessibility: jsonb("accessibility").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const blocks = pgTable("miley_blocks", {
  blockerId: integer("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: integer("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] }), index("miley_blocks_blocked_idx").on(table.blockedId), check("miley_blocks_no_self_check", sql`${table.blockerId} <> ${table.blockedId}`)]);

export const reports = pgTable("miley_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: varchar("target_type", { length: 32 }).notNull(),
  targetId: integer("target_id").notNull(),
  reason: varchar("reason", { length: 1000 }).notNull(),
  createdAt: createdAt(),
}, (table) => [index("miley_reports_target_idx").on(table.targetType, table.targetId), index("miley_reports_reporter_idx").on(table.reporterId, table.createdAt)]);

export const uploads = pgTable("miley_uploads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  originalName: varchar("original_name", { length: 240 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  expectedSize: bigint("expected_size", { mode: "number" }).notNull(),
  claimedSha256: char("claimed_sha256", { length: 64 }).notNull(),
  trackMetadata: jsonb("track_metadata").$type<Record<string, unknown>>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedTrackId: integer("completed_track_id").references(() => tracks.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (table) => [index("miley_uploads_user_idx").on(table.userId, table.createdAt), index("miley_uploads_expiry_idx").on(table.expiresAt), check("miley_uploads_expected_size_check", sql`${table.expectedSize} > 0`)]);

export const images = pgTable("miley_images", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 24 }).notNull(),
  contentType: varchar("content_type", { length: 40 }).notNull(),
  imageData: bytea("image_data").$type<Buffer>().notNull(),
  createdAt: createdAt(),
}, (table) => [index("miley_images_owner_idx").on(table.ownerId, table.createdAt), check("miley_images_purpose_check", sql`${table.purpose} IN ('avatar','channel_profile','channel_banner','artwork')`), check("miley_images_content_type_check", sql`${table.contentType} IN ('image/jpeg','image/png','image/webp')`)]);

export const notifications = pgTable("miley_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  resourceId: integer("resource_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [index("miley_notifications_user_date_idx").on(table.userId, table.createdAt), index("miley_notifications_unread_idx").on(table.userId, table.readAt)]);

export const podcasts = pgTable("miley_podcasts", {
  id: serial("id").primaryKey(),
  feedUrl: text("feed_url").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description").notNull().default(""),
  artworkUrl: text("artwork_url").notNull().default(""),
  language: varchar("language", { length: 80 }).notNull().default(""),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
  distributionAuthorized: boolean("distribution_authorized").notNull().default(false),
  rightsReviewedAt: timestamp("rights_reviewed_at", { withTimezone: true }),
  importedAt: createdAt(),
}, (table) => [uniqueIndex("miley_podcasts_feed_unique").on(table.feedUrl), index("miley_podcasts_owner_idx").on(table.ownerId), check("miley_podcasts_authorization_review_check", sql`NOT ${table.distributionAuthorized} OR ${table.rightsReviewedAt} IS NOT NULL`)]);

export const podcastEpisodes = pgTable("miley_podcast_episodes", {
  id: serial("id").primaryKey(),
  podcastId: integer("podcast_id").notNull().references(() => podcasts.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 500 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description").notNull().default(""),
  audioUrl: text("audio_url").notNull(),
  artworkUrl: text("artwork_url").notNull().default(""),
  durationSeconds: integer("duration_seconds"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [uniqueIndex("miley_podcast_episode_external_unique").on(table.podcastId, table.externalId), index("miley_podcast_episode_date_idx").on(table.podcastId, table.publishedAt)]);

export const podcastSubscriptions = pgTable("miley_podcast_subscriptions", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  podcastId: integer("podcast_id").notNull().references(() => podcasts.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.podcastId] })]);

export const podcastHistory = pgTable("miley_podcast_history", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  episodeId: integer("episode_id").notNull().references(() => podcastEpisodes.id, { onDelete: "cascade" }),
  positionSeconds: integer("position_seconds").notNull().default(0),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.episodeId] })]);
