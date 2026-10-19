import type { WorldBible } from "@/lib/types";

/**
 * Built-in worlds. Each is set up in the database on first visit (seed
 * reframed to 9:16, segmented, root scene created) and shared by everyone after.
 * The world bible is hand-written, so curated worlds skip step 1.
 */
export type CuratedWorld = {
  slug: string;
  title: string;
  blurb: string;
  seed: string;
  credit: string;
  bible: WorldBible;
};

export const CURATED: CuratedWorld[] = [
  {
    slug: "yellow-bedroom",
    title: "The Yellow Bedroom",
    blurb: "Van Gogh's room in Arles, 1888. Everything in it has been waiting for someone to touch it.",
    seed: "/worlds/bedroom.jpg",
    credit: "Vincent van Gogh, The Bedroom (1888). Van Gogh Museum, Amsterdam. Public domain.",
    bible: {
      title: "The Yellow Bedroom",
      setting:
        "A small upstairs bedroom in the Yellow House in Arles, southern France, 1888, late afternoon. Beyond the window: the town, the fields, the Rhône.",
      tone: "Warm, playful and gently uncanny: a room that is alive and glad of company",
      artStyle:
        "Vincent van Gogh oil painting, 1888: thick impasto brushstrokes, visible directional strokes, flat areas of saturated colour with dark outlines. Palette of chrome yellow, pale violet-blue walls, red-orange floorboards with green streaks, lime green window, a vermilion blanket. Flat, slightly tilted perspective, no cast shadows, bright even daylight.",
      camera:
        "Eye level from the doorway, a tall portrait frame taking in the room from ceiling to floorboards, steep naive perspective with the floor tilting up toward the viewer",
      characters: [
        { name: "You", description: "An unseen visitor; only your hands appear when you touch something" },
        {
          name: "The painter",
          description:
            "A thin man with a red-orange beard and cropped hair, blue smock, straw hat; appears only in the portraits on the wall unless coaxed out",
        },
      ],
      rules: [
        "Every object in the room is a little alive and reacts in the style of a Van Gogh painting",
        "The paintings on the wall are windows into the places they show, and you can step through them",
        "Sunflowers bloom wherever something kind is done",
        "Nothing is ever truly broken: smashed things re-form as brushstrokes",
        "The window shows Arles, and the town changes with what you do in the room",
      ],
      storySoFar: "You have just stepped into the painter's bedroom in Arles. He is out, and the room seems to be watching you.",
      safe: true,
    },
  },
];

export const curatedBySlug = (slug: string) => CURATED.find((w) => w.slug === slug);
