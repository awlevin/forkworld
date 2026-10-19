CREATE TABLE "costs" (
	"id" text PRIMARY KEY NOT NULL,
	"step" text NOT NULL,
	"model" text NOT NULL,
	"usd" numeric(12, 6) NOT NULL,
	"units" jsonb,
	"duration_ms" real,
	"world_id" text,
	"scene_id" text,
	"edge_id" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"from_scene_id" text NOT NULL,
	"object_id" text NOT NULL,
	"action_key" text NOT NULL,
	"action_text" text NOT NULL,
	"narration" text,
	"plan" jsonb,
	"video_url" text,
	"to_scene_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_by" text,
	"play_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"parent_scene_id" text,
	"via_edge_id" text,
	"image_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"objects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seg_status" text DEFAULT 'pending' NOT NULL,
	"story_so_far" text DEFAULT '' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"scene_id" text NOT NULL,
	"object_id" text NOT NULL,
	"actions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_scene_id_object_id_pk" PRIMARY KEY("scene_id","object_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text,
	"title" text NOT NULL,
	"seed_image_url" text NOT NULL,
	"bible" jsonb,
	"root_scene_id" text,
	"status" text DEFAULT 'creating' NOT NULL,
	"error" text,
	"created_by" text,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "costs_created_idx" ON "costs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "edges_key_idx" ON "edges" USING btree ("from_scene_id","object_id","action_key");--> statement-breakpoint
CREATE INDEX "edges_creator_idx" ON "edges" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "scenes_world_idx" ON "scenes" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "scenes_parent_idx" ON "scenes" USING btree ("parent_scene_id");