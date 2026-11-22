import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, generateDeck } from "../bundle/core/generator.js";

function reply(text, extra = {}) {
  return {
    role: "assistant",
    content: { type: "text", text },
    model: "fake/model",
    stopReason: "end_turn",
    usage: { inputTokens: 10, outputTokens: 20 },
    _meta: { quotaConsumed: 0.01 },
    ...extra,
  };
}

test("buildPrompt asks for the requested slide count and layouts", () => {
  const prompt = buildPrompt("Cats", 5);
  assert.ok(prompt.includes("5-slide"));
  assert.ok(prompt.includes('"compare"'));
  assert.ok(prompt.includes('"process"'));
});

test("generateDeck makes exactly one call and validates through the same chain", async () => {
  let calls = 0;
  const anna = {
    llm: {
      async complete(request) {
        calls += 1;
        assert.ok(request.messages[0].content.text.includes("Cats"));
        return {
          ok: true,
          result: reply(
            '```json\n{"title":"Cats","subtitle":"S","slides":[' +
            '{"layout":"cover","title":"Cats"},' +
            '{"layout":"bullets","title":"Facts","bullets":["one","two"]},' +
            '{"layout":"compare","title":"Cmp","left":{"heading":"A","points":["x"]},"right":{"heading":"B","points":["y"]}}' +
            "]}\n```"
          ),
        };
      },
    },
  };

  const { deck, meta } = await generateDeck(anna, { topic: "Cats", slideCount: 3 });
  assert.equal(calls, 1);
  assert.equal(deck.slides.length, 3);
  assert.deepEqual(
    deck.slides.map((slide) => slide.layout),
    ["cover", "bullets", "compare"]
  );
  assert.equal(meta.model, "fake/model");
  assert.equal(meta.quotaConsumed, 0.01);
  assert.ok(meta.latencyMs >= 0);
});

test("generateDeck rejects truncated output without retrying", async () => {
  let calls = 0;
  const anna = {
    llm: {
      async complete() {
        calls += 1;
        return reply('{"title":"Cut', { stopReason: "maxTokens" });
      },
    },
  };
  await assert.rejects(
    generateDeck(anna, { topic: "Cats", slideCount: 4 }),
    /output limit/
  );
  assert.equal(calls, 1);
});

test("generateDeck rejects an empty topic before touching the host", async () => {
  let calls = 0;
  await assert.rejects(
    generateDeck(
      { llm: { async complete() { calls += 1; } } },
      { topic: "   " }
    ),
    /topic/
  );
  assert.equal(calls, 0);
});
