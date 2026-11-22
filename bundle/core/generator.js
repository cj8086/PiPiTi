// AI generator: exactly one Anna LLM call per deck.
// The model chooses content and layout names; everything visual is computed
// later by layout.js. No model-authored code is ever executed.

import { clampSlideCount } from "./ir.js";
import { extractJson, normalizeDeck } from "./validator.js";

export class GenerationError extends Error {
  constructor(message, { code = "GENERATION_FAILED", details } = {}) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
    this.details = details;
  }
}

export function buildPrompt(topic, slideCount) {
  const count = clampSlideCount(slideCount);
  return [
    `Create a ${count}-slide presentation about: ${topic}`,
    "",
    "Return ONLY a JSON object — no prose, no markdown fences — with this exact shape:",
    '{"title":"Deck title","subtitle":"One line summary","slides":[',
    '  {"layout":"cover","title":"...","subtitle":"..."},',
    '  {"layout":"bullets","title":"...","bullets":["point","point","point"]},',
    '  {"layout":"compare","title":"...","left":{"heading":"...","points":["..."]},"right":{"heading":"...","points":["..."]}},',
    '  {"layout":"process","title":"...","steps":[{"label":"...","detail":"..."}]}',
    "]}",
    "",
    `Rules: produce exactly ${count} slides; slide 1 must be "cover";`,
    'use "bullets", "compare" and "process" for the remaining slides;',
    "3-5 bullets per bullets slide, max 14 words each; 2-5 points per compare side;",
    "3-4 steps per process slide; titles max 10 words; be concrete, never filler;",
    "write in the same language as the topic.",
  ].join("\n");
}

/** Host RPCs may return `{ok, result}` envelopes. */
export function unwrapHostResult(response) {
  if (response && typeof response === "object" && "ok" in response) {
    if (!response.ok) {
      const error = new Error(response.error?.message || "Anna host RPC failed");
      error.code = response.error?.code;
      error.details = response.error?.details;
      throw error;
    }
    return response.result !== undefined ? response.result : response;
  }
  return response;
}

/** Heuristic: stop reasons like "max_tokens" / "length" mean the JSON is incomplete. */
function isTruncated(reply) {
  const reason = String(reply?.stopReason ?? reply?.stop_reason ?? "").toLowerCase();
  return reason.includes("max") || reason.includes("length");
}

/**
 * Generate one deck through the Anna host LLM.
 * @param {{llm: {complete: Function}}} anna
 * @returns {Promise<{deck: object, meta: object}>}
 */
export async function generateDeck(anna, { topic, slideCount = 4, temperature = 0.4 } = {}) {
  const input = String(topic ?? "").trim();
  if (!input) throw new GenerationError("Enter a topic first.", { code: "EMPTY_TOPIC" });
  if (!anna?.llm?.complete) {
    throw new GenerationError("Anna LLM is not available in this window.", {
      code: "NO_HOST",
    });
  }

  const count = clampSlideCount(slideCount);
  // Rough output budget per slide, kept well under the 8192-token sync cap of
  // llm.complete; truncation is detected below and surfaced as an error.
  const maxTokens = Math.min(4096, 600 + 300 * count);

  let reply;
  const started = Date.now();
  try {
    reply = unwrapHostResult(
      await anna.llm.complete({
        messages: [{ role: "user", content: { type: "text", text: buildPrompt(input, count) } }],
        maxTokens,
        temperature,
      })
    );
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError(error.message || "Anna LLM call failed", {
      code: error.code || "LLM_CALL_FAILED",
      details: error.details,
    });
  }
  const latencyMs = Date.now() - started;

  if (isTruncated(reply)) {
    throw new GenerationError(
      "The model hit the output limit before finishing the deck. Try fewer slides.",
      { code: "TRUNCATED" }
    );
  }

  const content =
    typeof reply?.content === "string" ? reply.content : reply?.content?.text;
  if (!content || !String(content).trim()) {
    throw new GenerationError("The model returned an empty response.", {
      code: "EMPTY_RESPONSE",
    });
  }

  const raw = extractJson(String(content));
  const deck = normalizeDeck(raw, { slideCount: count });
  return {
    deck,
    meta: {
      model: reply?.model ?? null,
      latencyMs,
      usage: reply?.usage ?? {},
      quotaConsumed: reply?._meta?.quotaConsumed ?? null,
      stopReason: reply?.stopReason ?? null,
    },
  };
}
