import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ActionSuggestion, EdgePlan, SceneObject, WorldBible } from "../lib/types";

/** Anonymous players, identified by a cookie. Credits pay for new generations only. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  credits: integer("credits").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A world is one tree of scenes grown from a seed image.
 * Curated worlds have a slug; uploaded worlds don't.
 */
export const worlds = pgTable("worlds", {
  id: text("id").primaryKey(),
  slug: text("slug").unique(),
  title: text("title").notNull(),
  seedImageUrl: text("seed_image_url").notNull(),
  bible: jsonb("bible").$type<WorldBible>(),
  rootSceneId: text("root_scene_id"),
  /** creating → ready | failed | rejected (moderation) */
  status: text("status").notNull().default("creating"),
  error: text("error"),
  createdBy: text("created_by"),
  /** public: listed on the home page. unlisted: reachable by link only. */
  visibility: text("visibility").notNull().default("unlisted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One image in a world, with its clickable objects. */
export const scenes = pgTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    parentSceneId: text("parent_scene_id"),
    /** The edge that produced this scene (null for the root). */
    viaEdgeId: text("via_edge_id"),
    imageUrl: text("image_url").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    objects: jsonb("objects").$type<SceneObject[]>().notNull().default(sql`'[]'::jsonb`),
    /** pending → ready | failed. A scene is clickable once ready. */
    segStatus: text("seg_status").notNull().default("pending"),
    storySoFar: text("story_so_far").notNull().default(""),
    depth: integer("depth").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scenes_world_idx").on(t.worldId), index("scenes_parent_idx").on(t.parentSceneId)],
);

/**
 * scene + object + action → outcome. The unique key is the cache: an edge is
 * generated once and replayed for everyone after that.
 */
export const edges = pgTable(
  "edges",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").notNull(),
    fromSceneId: text("from_scene_id").notNull(),
    objectId: text("object_id").notNull(),
    /** Normalized action text, part of the cache key. */
    actionKey: text("action_key").notNull(),
    actionText: text("action_text").notNull(),
    narration: text("narration"),
    plan: jsonb("plan").$type<EdgePlan>(),
    videoUrl: text("video_url"),
    toSceneId: text("to_scene_id"),
    /** queued → planning → imaging → animating → ready | failed */
    status: text("status").notNull().default("queued"),
    error: text("error"),
    createdBy: text("created_by"),
    playCount: integer("play_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("edges_key_idx").on(t.fromSceneId, t.objectId, t.actionKey),
    index("edges_creator_idx").on(t.createdBy, t.createdAt),
  ],
);

/** The three suggested actions per object, shared by every player so choices converge on cached paths. */
export const suggestions = pgTable(
  "suggestions",
  {
    sceneId: text("scene_id").notNull(),
    objectId: text("object_id").notNull(),
    actions: jsonb("actions").$type<ActionSuggestion[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sceneId, t.objectId] })],
);

/** One row per paid model call. */
export const costs = pgTable(
  "costs",
  {
    id: text("id").primaryKey(),
    /** world-bible | segment-propose | segment | segment-label | actions | validate | outcome | keyframe | video | moderation */
    step: text("step").notNull(),
    model: text("model").notNull(),
    usd: numeric("usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
    /** Tokens, seconds, images: whatever the price was computed from. */
    units: jsonb("units").$type<Record<string, number>>(),
    durationMs: real("duration_ms"),
    worldId: text("world_id"),
    sceneId: text("scene_id"),
    edgeId: text("edge_id"),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("costs_created_idx").on(t.createdAt)],
);

/** Progress and errors from background jobs, for /admin. */
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    /** world:<id>, edge:<id> or scene:<id> */
    subject: text("subject").notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_created_idx").on(t.createdAt), index("events_subject_idx").on(t.subject)],
);

export type World = typeof worlds.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Edge = typeof edges.$inferSelect;
