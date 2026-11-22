import test from "node:test";
import assert from "node:assert/strict";
import { LAYOUTS } from "../bundle/core/ir.js";
import {
  SLIDE,
  THEME,
  countLines,
  fitFontSize,
  layoutSlide,
} from "../bundle/core/layout.js";
import { mockDeck } from "../bundle/core/mock.js";

test("mock deck exercises all four layouts", () => {
  const layouts = new Set(mockDeck().slides.map((slide) => slide.layout));
  assert.deepEqual([...layouts].sort(), [...LAYOUTS].sort());
});

test("fitFontSize shrinks long text and respects the minimum", () => {
  assert.equal(fitFontSize("Short title", { w: 6, h: 1, size: 40, min: 12 }), 40);
  assert.equal(
    fitFontSize("x".repeat(800), { w: 5, h: 0.5, size: 40, min: 12 }),
    12
  );
});

test("countLines handles explicit newlines and CJK", () => {
  assert.equal(countLines("a\nb", 10, 12), 2);
  assert.ok(countLines("这是一个很长的中文标题".repeat(6), 3, 12) > 1);
});

test("every layout stays inside the 16:9 canvas", () => {
  const deck = mockDeck();
  deck.slides.forEach((slide, index) => {
    const spec = layoutSlide(slide, index, deck.slides.length);
    assert.ok(spec.elements.length > 0, `${slide.layout} has no elements`);
    assert.equal(spec.width, 13.333);
    assert.equal(spec.height, 7.5);
    for (const el of spec.elements) {
      assert.ok(el.x >= 0, `${slide.layout} x < 0`);
      assert.ok(el.y >= 0, `${slide.layout} y < 0`);
      assert.ok(el.x + el.w <= SLIDE.width + 0.001, `${slide.layout} overflows X`);
      assert.ok(el.y + el.h <= SLIDE.height + 0.001, `${slide.layout} overflows Y`);
    }
  });
});

test("computed type sizes fit their text boxes", () => {
  const deck = mockDeck();
  deck.slides.forEach((slide, index) => {
    const spec = layoutSlide(slide, index, deck.slides.length);
    for (const el of spec.elements.filter((item) => item.type === "text")) {
      const content = el.paragraphs ? el.paragraphs.join("\n") : el.text;
      const lines = countLines(content, el.w, el.fontSize, el.bold);
      const needed = (lines * el.fontSize * el.lineSpacing) / 72;
      assert.ok(
        needed <= el.h + 0.02,
        `${slide.layout} text needs ${needed.toFixed(2)}in in a ${el.h}in box`
      );
    }
  });
});

test("theme uses one font family and one accent for both renderers", () => {
  assert.equal(THEME.fontFace, "Arial");
  assert.equal(THEME.colors.accent, "#D86B3C");
});
