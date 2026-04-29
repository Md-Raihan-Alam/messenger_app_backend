import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  name: text("name"),
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
