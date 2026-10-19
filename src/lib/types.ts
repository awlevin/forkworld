import { z } from "zod";

/** Normalized point, 0..1 in both axes. */
export type Pt = [number, number];

export const worldBibleSchema = z.object({
  title: z.string().describe("A short evocative title for this world, 2-5 words"),
  setting: z.string().describe("Where and when this world takes place"),
  tone: z.string().describe("Mood and genre, e.g. 'whimsical, quietly eerie'"),
  artStyle: z
    .string()
    .describe("Precise visual style to preserve in every image: medium, palette, brushwork, lighting, lens"),
  camera: z.string().describe("Camera feel: framing, height, lens, how scenes are usually composed"),
  characters: z
    .array(z.object({ name: z.string(), description: z.string().describe("Visual description for consistency") }))
    .describe("Main characters, including the unseen player if relevant"),
  rules: z.array(z.string()).describe("Rules of this world that outcomes must respect"),
  storySoFar: z.string().describe("One or two sentences: the situation at the very start"),
  safe: z.boolean().describe("false if the image is sexual, graphically violent, hateful or shows a real private person"),
});
export type WorldBible = z.infer<typeof worldBibleSchema>;

export type SceneObject = {
  id: string;
  label: string;
  /** Outer contours of the mask, normalized. Usually one ring; disjoint parts get their own. */
  polygons: Pt[][];
  /** [x, y, w, h], normalized. */
  bbox: [number, number, number, number];
  /** Fraction of the image covered by the mask. */
  area: number;
};

export const actionSuggestionSchema = z.object({
  text: z.string().describe("Imperative, 2-6 words, e.g. 'Open the chest'"),
  kind: z.enum(["sensible", "bold", "weird"]),
});
export type ActionSuggestion = z.infer<typeof actionSuggestionSchema>;

export const outcomePlanSchema = z.object({
  narration: z.string().describe("One sentence, second person, present tense"),
  imagePrompt: z.string().describe("Detailed edit instruction for the next scene image"),
  motionPrompt: z.string().describe("Short description of the motion between the two frames"),
  storySoFar: z.string().describe("Updated running summary, at most 4 sentences"),
  title: z.string().describe("2-4 word caption for this new scene, for the breadcrumb"),
});
export type OutcomePlan = z.infer<typeof outcomePlanSchema>;

export type EdgePlan = OutcomePlan & {
  models?: { llm?: string; image?: string; video?: string };
};

export type EdgeStatus = "queued" | "planning" | "imaging" | "animating" | "ready" | "failed";

/** What the player needs to render a scene. */
export type SceneView = {
  id: string;
  worldId: string;
  worldTitle: string;
  imageUrl: string;
  width: number;
  height: number;
  segStatus: string;
  objects: SceneObject[];
  storySoFar: string;
  depth: number;
  parentSceneId: string | null;
  /** Edges already explored from this scene, so objects can show "others went here". */
  explored: ExploredEdge[];
  path: PathStep[];
};

export type ExploredEdge = {
  edgeId: string;
  objectId: string;
  actionText: string;
  status: EdgeStatus;
  playCount: number;
};

export type PathStep = {
  sceneId: string;
  imageUrl: string;
  /** The action that led here (null for the root). */
  actionText: string | null;
  title: string | null;
};

export type EdgeView = {
  id: string;
  status: EdgeStatus;
  actionText: string;
  narration: string | null;
  videoUrl: string | null;
  toSceneId: string | null;
  toImageUrl: string | null;
  error: string | null;
  cached: boolean;
};
