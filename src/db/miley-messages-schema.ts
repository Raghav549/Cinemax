import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./music-schema";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const conversations = pgTable("miley_conversations", {
  id: serial("id").primaryKey(),
  userA: integer("user_a").notNull().references(() => users.id, { onDelete: "cascade" }),
  userB: integer("user_b").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("miley_conversations_pair_unique").on(table.userA, table.userB), index("miley_conversations_user_a_idx").on(table.userA, table.lastMessageAt), index("miley_conversations_user_b_idx").on(table.userB, table.lastMessageAt), check("miley_conversations_sorted_pair_check", sql`${table.userA} < ${table.userB}`)]);

export const directMessages = pgTable("miley_direct_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: varchar("body", { length: 2000 }).notNull(),
  createdAt: createdAt(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (table) => [index("miley_direct_messages_conversation_date_idx").on(table.conversationId, table.createdAt), index("miley_direct_messages_sender_date_idx").on(table.senderId, table.createdAt)]);
