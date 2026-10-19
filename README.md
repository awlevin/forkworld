# Forkworld

An endless, shared point-and-click adventure. Every scene is a picture. Tap
anything in it, choose what to do, and a short clip plays into the next
scene. Every choice is saved, so the world grows as people explore it: the
next person to try the same thing gets it instantly, for free.

Built mobile first: scenes are 9:16 and fill a phone screen.

## How it plays

1. A full-screen scene. Tap an object: its outline glows and a sheet slides
   up with three suggested actions (sensible, bold, weird), paths other
   players already took, and "Do something else…".
2. Pick one. If someone already took that path, the clip plays at once.
   Otherwise the narration appears right away and the camera drifts into the
   object while the next scene is generated (about a minute).
3. The clip plays from the current scene into the new one, which is tappable
   when it ends. Repeat forever.
4. The pause button opens the pause screen: your path from the start of the
   world (tap a scene to go back), the story so far, sharing, and what
   everything cost. Every scene has its own URL, so sharing shares that moment.

Start from a curated world, or upload any picture to start a new one.

## Pipeline

Each step is its own module in `src/lib/ai/`, and its model is set in
`src/lib/ai/config.ts` (overridable by env var).

| Step | Module | Default model |
| --- | --- | --- |
| 1. World bible from the seed image | `world-bible.ts` | `openai:gpt-5.5` |
| 2. Clickable objects: LLM proposes, SAM 3 masks, LLM reviews a contact sheet of the masks | `segment.ts` | `fal-ai/sam-3/image` + `gpt-5.5` |
| 3. Three actions for an object; checking typed actions | `actions.ts` | `openai:gpt-5.4-mini` |
| 4. Outcome: narration, image prompt, motion prompt, story so far | `outcome.ts` | `openai:gpt-5.5` |
| 5. Next keyframe, edited from the current scene | `keyframe.ts` | `fal-ai/nano-banana-2/edit` |
| 6. Transition clip from the current scene to the keyframe | `video.ts` | `fal-ai/veo3.1/fast/first-last-frame-to-video` (4 s, 720p, no audio) |
| 7. Segment the new scene, in parallel with step 6 | `segment.ts` | as step 2 |

LLM calls go through the Vercel AI Gateway (no key needed on Vercel, billed
to the Vercel team) unless `OPENAI_API_KEY` is set, in which case they call
OpenAI directly with the same models. While the team is on the gateway's free
tier, `LLM_MODEL` and `LLM_FAST_MODEL` are set in Vercel to
`gateway:openai/gpt-5.4-nano`, the one capable model the free tier allows;
delete them to go back to the defaults. `/api/admin/models?key=…&models=a,b`
checks which models a deployment can call.

There is no separate moderation step yet. The world bible flags unusable
uploads (`safe`), and the step 3 validator rejects typed actions that break
the content rules or the world, and maps them onto existing actions so they
replay from cache.

All LLM prompts are in [`prompts/`](prompts/README.md), one Markdown file per
step, with the image and motion wrappers for steps 5 and 6.

Uploads and curated seeds are reframed to 9:16 by the image model (it
extends the picture above and below), because Veo renders 16:9 or 9:16 only
and every frame has to line up.

## Caching and the world tree

- `worlds`: seed image, world bible, root scene.
- `scenes`: image, clickable objects (outline polygons, box, label), story so far, depth, parent.
- `edges`: scene + object + action → narration, plan, video, next scene. A unique key on
  (scene, object, normalized action) is the cache. An edge is generated once; everyone after
  replays it and its play count goes up.
- `suggestions`: the three actions per object, generated once and shown to everyone, so
  players converge on cached paths.
- `costs`: one row per paid model call, with the model, step, units and dollar estimate.

Generation runs in the background with `after()` on a 300 s function. The
client polls `/api/edges/:id`. Each stage (plan, keyframe, video) is saved as
it finishes, so a retry after a failure resumes rather than paying twice. An
edge that stops moving for 6 minutes counts as failed and can be retried.

## Credits and limits

Players are anonymous, identified by a cookie. Each starts with 20 credits
(`START_CREDITS`). A new path or an uploaded world costs 1 credit; replaying a
cached path is free. A failed generation refunds its credit. Limits: 12 new
paths and 4 uploads per player per hour.

## Costs

Every paid model call writes a row to `costs` with its step, model, units and
dollar amount, and where that amount came from:

- `gateway`: the charge the Vercel AI Gateway reports for that call.
- `fal-price`: fal doesn't report a per-request cost, so this is the quantity
  generated × your account's live unit price from fal's pricing API.
- `list-price` / `table`: the published price in `src/lib/ai/pricing.ts`, used
  only when the above aren't available.

In the game, the pause screen shows what the current scene cost to make (step
by step), this world, you, and everyone. `/admin/costs?key=$ADMIN_KEY` has the
full breakdown per model, step and day, plus recent job events. A new path costs about $0.50, mostly
the video ($0.40 for 4 s of Veo 3.1 Fast); the image is $0.08 and the LLM and
SAM calls a few cents.

## Setup

Requirements: Node 22+, pnpm 10.

```sh
pnpm install
cp .env.example .env.local   # fill in the keys below
vercel env pull .env.local   # or: database, blob and AI Gateway credentials from the Vercel project
pnpm db:migrate
pnpm dev
```

### Environment variables

| Name | What for | Where to get it |
| --- | --- | --- |
| `FAL_KEY` (or `FAL_API_KEY`) | SAM 3, Nano Banana 2, Veo 3.1 | fal.ai → Dashboard → Keys |
| `OPENAI_API_KEY` | Optional. Calls OpenAI directly instead of through the AI Gateway | platform.openai.com → API keys |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Postgres | Neon (set automatically by the Vercel Neon integration) |
| `BLOB_READ_WRITE_TOKEN` | Images and videos | Vercel Blob (set automatically when the store is connected) |
| `ADMIN_KEY` | Opens the cost dashboard | Any secret string |

Optional overrides are listed in `.env.example`.

### Deploying

The Vercel project `forkworld` builds `main`. The build runs `drizzle-kit
migrate` before `next build`, so schema changes ship with the code. After
changing `src/db/schema.ts`, run `pnpm db:generate` and commit the new file in
`drizzle/`.

## Curated worlds

`src/worlds/index.ts`. A curated world is a seed image in `public/worlds/`
plus a hand-written world bible. It is set up on its first visit.

- *The Yellow Bedroom*: Vincent van Gogh, *The Bedroom* (1888), Van Gogh
  Museum, Amsterdam. Public domain.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
```
