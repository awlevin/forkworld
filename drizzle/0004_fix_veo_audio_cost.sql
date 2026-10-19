-- Veo clips logged before this fix used fal's default (audio on) rate; audio is off, which is 2/3 of that.
UPDATE "costs" SET "usd" = "usd" * 2 / 3
WHERE "model" = 'fal-ai/veo3.1/fast/first-last-frame-to-video' AND "source" = 'fal-price' AND "created_at" < '2026-10-19T14:45:00Z';
