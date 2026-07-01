import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),

  isOnline: boolean("is_online").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  name: text("name"),
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

// ─────────────────────────────────────────────
// RELATIONS
// These don't create SQL — they only tell Drizzle's query builder
// how tables relate, enabling the `with: {...}` syntax in db.query.*
// ─────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  conversationMemberships: many(conversationMembers),
  sentMessages: many(messages),
  seenMessages: many(messageSeen),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  members: many(conversationMembers),
  messages: many(messages),
}));

export const conversationMembersRelations = relations(
  conversationMembers,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMembers.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationMembers.userId],
      references: [users.id],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  seenBy: many(messageSeen),
}));

export const messageSeenRelations = relations(messageSeen, ({ one }) => ({
  message: one(messages, {
    fields: [messageSeen.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageSeen.userId],
    references: [users.id],
  }),
}));
