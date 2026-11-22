// PiPiTi Slide IR — the single slide model shared by every renderer.
// The LLM only supplies semantic content + a layout name; all geometry,
// type scale and colour live in layout.js.

export const LAYOUTS = Object.freeze(["cover", "bullets", "compare", "process"]);

// Hard caps. They protect the fixed layout geometry (nothing can overflow)
// and keep LLM prompts/responses inside a small, predictable token budget.
export const LIMITS = Object.freeze({
  minSlides: 2,
  maxSlides: 8,
  maxBullets: 6,
  maxPoints: 5,
  maxSteps: 5,
  maxTitle: 80,
  maxSubtitle: 160,
  maxBullet: 150,
  maxStepDetail: 140,
});

export function isLayout(value) {
  return LAYOUTS.includes(value);
}

/** Normalize one compare column; null when absent so renderers can skip it. */
function side(value) {
  if (!value || typeof value !== "object") return null;
  return {
    heading: String(value.heading ?? ""),
    points: Array.isArray(value.points) ? value.points.map(String) : [],
  };
}

/** Canonical Slide. Every field always exists so renderers need no guards. */
export function createSlide(input = {}) {
  return {
    layout: isLayout(input.layout) ? input.layout : "bullets",
    title: String(input.title ?? ""),
    subtitle: String(input.subtitle ?? ""),
    bullets: Array.isArray(input.bullets) ? input.bullets.map(String) : [],
    left: side(input.left),
    right: side(input.right),
    steps: Array.isArray(input.steps)
      ? input.steps.map((step) => ({
        label: String(step?.label ?? ""),
        detail: String(step?.detail ?? ""),
      }))
      : [],
  };
}

/** Canonical Presentation. */
export function createDeck(input = {}) {
  return {
    title: String(input.title ?? ""),
    subtitle: String(input.subtitle ?? ""),
    slides: Array.isArray(input.slides) ? input.slides.map(createSlide) : [],
  };
}

/** Clamp a user/model slide count into [minSlides, maxSlides]; defaults to 4. */
export function clampSlideCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.min(LIMITS.maxSlides, Math.max(LIMITS.minSlides, Math.round(n)));
}
