import test from "node:test";
import assert from "node:assert/strict";
import { createSlide } from "../bundle/core/ir.js";
import { layoutSlide } from "../bundle/core/layout.js";
import { renderSlideHtml } from "../bundle/core/render-web.js";

test("renderSlideHtml emits a 1280x720 stage", () => {
  const spec = layoutSlide(
    createSlide({ layout: "bullets", title: "Hello", bullets: ["One", "Two"] }),
    0,
    1
  );
  const html = renderSlideHtml(spec);
  assert.ok(html.includes('class="stage"'));
  assert.ok(html.includes("width:1280px;height:720px"));
  assert.ok(html.includes("Hello"));
  assert.ok(html.includes("<li>One</li>"));
});

test("renderSlideHtml escapes untrusted model text", () => {
  const spec = layoutSlide(
    createSlide({
      layout: "bullets",
      title: '<script>alert("x")</script>',
      bullets: ["<img src=x onerror=alert(1)>"],
    }),
    0,
    1
  );
  const html = renderSlideHtml(spec);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
});
