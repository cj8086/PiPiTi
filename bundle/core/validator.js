// Model-output validator.
// Turns whatever the LLM returned into the canonical Slide IR: extracts JSON
// from prose/code fences, repairs trivial syntax, drops unknown layouts,
// clamps lengths and guarantees a cover slide. No DOM, no SDK — Node-testable.

import { LAYOUTS, LIMITS, clampSlideCount, createSlide } from "./ir.js";

export class DeckValidationError extends Error {
  constructor(message, { code = "INVALID_DECK", raw = "" } = {}) {
    super(message);
    this.name = "DeckValidationError";
    this.code = code;
    this.raw = raw;
  }
}

/** Pull the first parseable JSON object out of a model response. */
export function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new DeckValidationError("Model returned an empty response", {
      code: "EMPTY_OUTPUT",
      raw: text,
    });
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const candidates = [body];
  if (start >= 0 && end > start) candidates.push(body.slice(start, end + 1));

  let lastError = null;
  for (const candidate of candidates) {
    for (const variant of [candidate, candidate.replace(/,\s*([\]}])/g, "$1")]) {
      try {
        const value = JSON.parse(variant);
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw new DeckValidationError(
    `Model output was not valid JSON: ${lastError?.message || "no object found"}`,
    { code: "JSON_PARSE", raw: text }
  );
}

/**
 * Normalize whitespace and truncate to `max` chars, preferring a word
 * boundary so cut-off text still reads well (appends an ellipsis).
 */
function clean(value, max) {
  const text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || !max || text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  const head = at > max * 0.6 ? cut.slice(0, at) : cut;
  return `${head.trimEnd()}…`;
}

/**
 * Coerce a value into a clean string list. Strings are split on newlines /
 * semicolons / bullet chars; items are trimmed, deduplicated case-insensitively,
 * length-clamped and capped at `maxItems`.
 */
function toList(value, maxItems, maxLength) {
  let source = value;
  if (typeof source === "string") source = source.split(/\n|;|•/);
  if (!Array.isArray(source)) return [];
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const text = clean(item, maxLength);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Pick a layout: trust the model when the name is valid, otherwise infer from
 * the fields it actually produced; the first slide falls back to "cover".
 */
function inferLayout(raw, index) {
  if (LAYOUTS.includes(raw.layout)) return raw.layout;
  if (Array.isArray(raw.steps) && raw.steps.length >= 2) return "process";
  if (raw.left || raw.right) return "compare";
  if (raw.bullets || raw.points) return "bullets";
  return index === 0 ? "cover" : "bullets";
}

function normalizeSide(value, fallbackHeading) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    heading: clean(value.heading ?? value.title, 48) || fallbackHeading,
    points: toList(value.points ?? value.bullets, LIMITS.maxPoints, LIMITS.maxBullet),
  };
}

function normalizeSteps(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step) => step && typeof step === "object")
    .slice(0, LIMITS.maxSteps)
    .map((step) => ({
      label: clean(step.label ?? step.title, 48),
      detail: clean(step.detail ?? step.description, LIMITS.maxStepDetail),
    }))
    .filter((step) => step.label || step.detail);
}

function normalizeSlide(raw, index, deck) {
  const layout = inferLayout(raw, index);
  const slide = createSlide({
    layout,
    title: clean(raw.title ?? raw.heading, LIMITS.maxTitle),
    subtitle: clean(raw.subtitle ?? raw.caption, LIMITS.maxSubtitle),
    bullets: toList(raw.bullets ?? raw.points ?? raw.text, LIMITS.maxBullets, LIMITS.maxBullet),
    steps: normalizeSteps(raw.steps),
  });
  slide.left = normalizeSide(raw.left, "Left");
  slide.right = normalizeSide(raw.right, "Right");

  if (slide.layout === "cover") {
    slide.title = slide.title || deck.title;
    slide.subtitle = slide.subtitle || deck.subtitle;
  } else {
    slide.title = slide.title || `Untitled slide ${index + 1}`;
  }

  // Demote layouts whose content is missing so a slide never renders empty:
  // a compare without columns/points becomes bullets, and a process with
  // fewer than 2 steps becomes bullets. Fields unused by the final layout are
  // cleared below so renderers always see exactly one layout's worth of data.
  if (slide.layout === "compare") {
    const points =
      (slide.left?.points.length || 0) + (slide.right?.points.length || 0);
    if (!slide.left && !slide.right) {
      slide.layout = "bullets";
    } else if (!points) {
      slide.layout = slide.bullets.length ? "bullets" : "compare";
      slide.left = slide.left || { heading: "Left", points: [] };
      slide.right = slide.right || { heading: "Right", points: [] };
    } else {
      slide.left = slide.left || { heading: "Left", points: [] };
      slide.right = slide.right || { heading: "Right", points: [] };
    }
  }

  if (slide.layout === "process" && slide.steps.length < 2 && slide.bullets.length) {
    slide.layout = "bullets";
    slide.steps = [];
  }

  if (slide.layout !== "compare") {
    slide.left = null;
    slide.right = null;
  }
  if (slide.layout !== "process") slide.steps = [];
  if (slide.layout !== "bullets") slide.bullets = [];
  return slide;
}

/**
 * Validate + normalize a raw model object into a Presentation.
 * `slideCount` is a target, never a reason to fabricate content.
 */
export function normalizeDeck(raw, { slideCount } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DeckValidationError("Model output is not a JSON object", {
      code: "NOT_OBJECT",
      raw,
    });
  }
  const wanted = clampSlideCount(slideCount);
  const rawSlides = Array.isArray(raw.slides)
    ? raw.slides.filter((slide) => slide && typeof slide === "object")
    : [];
  if (!rawSlides.length) {
    throw new DeckValidationError("Deck JSON is missing a non-empty slides[]", {
      code: "NO_SLIDES",
      raw,
    });
  }

  const title =
    clean(raw.title ?? rawSlides[0].title, LIMITS.maxTitle) || "Untitled presentation";
  const subtitle = clean(raw.subtitle ?? raw.tagline, LIMITS.maxSubtitle);
  const deck = { title, subtitle };

  let slides = rawSlides
    .slice(0, wanted)
    .map((slide, index) => normalizeSlide(slide, index, deck));

  if (slides[0].layout !== "cover") {
    slides.unshift(
      createSlide({ layout: "cover", title, subtitle })
    );
  }
  slides = slides.slice(0, wanted);

  return { title, subtitle, slides };
}
