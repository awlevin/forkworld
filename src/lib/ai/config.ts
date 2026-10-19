import "server-only";

/**
 * Which model runs each step. Every step reads from here, so swapping a model
 * is an env var rather than a code change.
 *
 * LLM ids are "provider:model": "openai:gpt-5.5", "anthropic:claude-sonnet-5-5",
 * or "gateway:openai/gpt-5.5" for the Vercel AI Gateway.
 */
export function aiConfig() {
  // With an OpenAI key, call OpenAI directly; otherwise the same models through
  // the Vercel AI Gateway, which authenticates deployments on its own (OIDC).
  const via = process.env.OPENAI_API_KEY ? "openai:" : "gateway:openai/";
  return {
    /** World bible, segmentation, outcome planning: quality matters most. */
    llm: process.env.LLM_MODEL ?? `${via}gpt-5.5`,
    /** Action suggestions and typed-action checks: the player is waiting on these. */
    llmFast: process.env.LLM_FAST_MODEL ?? `${via}gpt-5.4-mini`,
    segment: process.env.SEGMENT_MODEL ?? "fal-ai/sam-3/image",
    image: process.env.IMAGE_MODEL ?? "fal-ai/nano-banana-2/edit",
    video: process.env.VIDEO_MODEL ?? "fal-ai/veo3.1/fast/first-last-frame-to-video",
    /**
     * OpenAI's moderation endpoint needs an OpenAI key. Without one, the LLM
     * checks that always run do the job: the world bible's `safe` flag for
     * uploads and the action validator for typed actions.
     */
    moderation: process.env.OPENAI_API_KEY ? "omni-moderation-latest" : "llm",
  };
}
