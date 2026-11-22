import test from "node:test";
import assert from "node:assert/strict";
import {
  DeckValidationError,
  extractJson,
  normalizeDeck,
} from "../bundle/core/validator.js";

test("extractJson parses fenced JSON surrounded by prose", () => {
  const value = extractJson(
    'Here you go:\n```json\n{"title":"T","slides":[{"layout":"cover","title":"T"}]}\n```\nDone.'
  );
  assert.equal(value.title, "T");
  assert.equal(value.slides.length, 1);
});

test("extractJson repairs trailing commas", () => {
  const value = extractJson('{"slides":[{"layout":"cover","title":"T"},],}');
  assert.equal(value.slides.length, 1);
});

test("extractJson rejects empty and non-JSON output", () => {
  assert.throws(() => extractJson("   "), DeckValidationError);
  assert.throws(() => extractJson("no json here"), DeckValidationError);
});

test("normalizeDeck rejects a deck without slides", () => {
  assert.throws(() => normalizeDeck({ title: "x" }), /slides/);
  assert.throws(() => normalizeDeck(null), DeckValidationError);
});

test("normalizeDeck infers layouts, dedupes bullets and forces a cover first", () => {
  const deck = normalizeDeck(
    {
      title: "  Test   deck ",
      slides: [
        { title: "Intro", bullets: ["a", "a", "b"] },
        {
          title: "Compare",
          left: { heading: "L", points: ["x"] },
          right: { heading: "R", points: ["y"] },
        },
        { title: "Flow", steps: [{ label: "One", detail: "d" }, { label: "Two" }] },
        { layout: "mystery", text: "line one\nline two" },
      ],
    },
    { slideCount: 4 }
  );

  assert.equal(deck.title, "Test deck");
  assert.deepEqual(
    deck.slides.map((slide) => slide.layout),
    ["cover", "bullets", "compare", "process"]
  );
  assert.deepEqual(deck.slides[1].bullets, ["a", "b"]);
  assert.equal(deck.slides[2].left.heading, "L");
  assert.equal(deck.slides[3].steps.length, 2);
});

test("normalizeDeck clamps slide count and keeps the cover", () => {
  const raw = {
    title: "Deck",
    slides: Array.from({ length: 9 }, (_, i) => ({
      layout: i === 0 ? "cover" : "bullets",
      title: `Slide ${i}`,
      bullets: ["point"],
    })),
  };
  const deck = normalizeDeck(raw, { slideCount: 3 });
  assert.equal(deck.slides.length, 3);
  assert.equal(deck.slides[0].layout, "cover");
  assert.ok(normalizeDeck(raw, { slideCount: 99 }).slides.length <= 8);
});

test("normalizeDeck truncates overlong fields", () => {
  const deck = normalizeDeck(
    {
      title: "T",
      slides: [
        { layout: "cover", title: "T" },
        { layout: "bullets", title: "Long", bullets: ["word ".repeat(80)] },
      ],
    },
    { slideCount: 2 }
  );
  assert.ok(deck.slides[1].bullets[0].length <= 151);
  assert.ok(deck.slides[1].bullets[0].endsWith("…"));
});
