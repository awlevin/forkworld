CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_subject_idx" ON "events" USING btree ("subject");