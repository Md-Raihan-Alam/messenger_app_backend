import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),

  // presence tracking — updated by Socket.IO connect/disconnect events
  isOnline: boolean("is_online").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  name: text("name"), // used for group chats; null for individual chats

  // distinguishes a 1-on-1 conversation from a group conversation
  isGroup: boolean("is_group").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationMembers = pgTable("conversation_members", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .references(() => conversations.id)
    .notNull(),

  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),

  // relevant only in group conversations — "member" is the default,
  // "admin" can manage the group (add/remove members, rename, etc.)
  role: text("role").notNull().default("member"),

  joinedAt: timestamp("joined_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .references(() => conversations.id)
    .notNull(),

  senderId: integer("sender_id")
    .references(() => users.id)
    .notNull(),

  content: text("content").notNull(),

  createdAt: timestamp("created_at").defaultNow(),
});

// Tracks which users have seen which messages, and when.
// One row per (message, user) pair — required because in group chats,
// a single message can be seen by some members and not others.
export const messageSeen = pgTable("message_seen", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id")
    .references(() => messages.id)
    .notNull(),

  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),

  seenAt: timestamp("seen_at").defaultNow(),
});
