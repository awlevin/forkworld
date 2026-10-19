# Prompts

Every LLM step in the pipeline reads its prompt from this folder at run time,
so you can tune a prompt and try it again without a rebuild (in dev, files
are re-read on every call).

| File | Step | Model tier | Output |
| --- | --- | --- | --- |
| `world-bible.md` | 1. World bible from the seed image | `LLM_MODEL` | `WorldBible` |
| `segment-propose.md` | 2a. Which objects to segment, with SAM 3 text prompts | `LLM_MODEL` | candidates |
| `segment-label.md` | 2b. Label the mask crops, drop bad masks, rank by interest | `LLM_MODEL` | labels |
| `actions.md` | 3a. Three actions for a clicked object | `LLM_FAST_MODEL` | 3 actions |
| `validate-action.md` | 3b. Check or rewrite a typed action | `LLM_FAST_MODEL` | verdict |
| `outcome.md` | 4. Narration, image prompt, motion prompt, story so far | `LLM_MODEL` | `OutcomePlan` |
| `keyframe.md` | 5. Wrapper around the image prompt sent to the image model | none | text |
| `motion.md` | 6. Wrapper around the motion prompt sent to the video model | none | text |

## Format

```
Notes for humans (not sent).

## System
Instructions for the model.

## User
The message, with {{placeholders}} filled from code.
```

A `{{name}}` with no value throws, so a typo shows up at once. The output
shapes are zod schemas in `src/lib/types.ts` and next to each step in
`src/lib/ai/`; field descriptions there are sent to the model too.
