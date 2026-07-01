CREATE TABLE "message_seen" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"seen_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "conversation_members" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD COLUMN "joined_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "is_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "message_seen" ADD CONSTRAINT "message_seen_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_seen" ADD CONSTRAINT "message_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;