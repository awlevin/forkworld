import { describe, expect, it } from "vitest";
import { falUsage, llmCost } from "./pricing";

describe("llmCost", () => {
  it("prices direct and gateway ids the same", () => {
    expect(llmCost("openai:gpt-5.5", 1_000_000, 0)).toBe(5);
    expect(llmCost("gateway:openai/gpt-5.5", 1_000_000, 0)).toBe(5);
    expect(llmCost("gateway:openai/gpt-5.4-mini", 0, 1_000_000)).toBe(4.5);
  });
  it("maps Anthropic's dashed versions", () => {
    expect(llmCost("anthropic:claude-sonnet-5-5", 1_000_000, 0)).toBe(2);
    expect(llmCost("gateway:anthropic/claude-sonnet-5.5", 1_000_000, 0)).toBe(2);
  });
});


describe("falUsage", () => {
  it("prices Veo 3.1 Fast without audio at $0.10/s from a $0.15/s default", () => {
    const u = falUsage("fal-ai/veo3.1/fast/first-last-frame-to-video", { duration: "4s", generate_audio: false })!;
    expect(u.quantity * u.listPrice * u.multiplier).toBeCloseTo(0.4);
  });
  it("prices Nano Banana 2 at 1K as one image", () => {
    const u = falUsage("fal-ai/nano-banana-2/edit", { resolution: "1K" })!;
    expect(u.quantity * u.listPrice * u.multiplier).toBeCloseTo(0.08);
  });
});
