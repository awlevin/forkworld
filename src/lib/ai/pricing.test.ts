import { describe, expect, it } from "vitest";
import { llmCost } from "./pricing";

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
