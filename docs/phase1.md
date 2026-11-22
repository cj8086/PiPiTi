# Phase 1 — Core Engine

Date: 2026-11-22 · Environment: macOS (arm64), Anna staging harness (local, port 5180)

Phase 1 built the generation and rendering chain behind the MVP UI. No version was cut, nothing
was submitted for review, and no production app was published.

```
topic + slide count
  → Anna LLM (one call)
  → raw text
  → extractJson / normalizeDeck        (validator.js)
  → Slide IR                           (ir.js)
  → layoutSlide() → inch-based spec    (layout.js)
  → renderSlideHtml()  |  buildPptx()  (render-web.js / render-pptx.js)
  → preview            |  editable .pptx → upload.inline → download URL
```

## 1. Modules

| File | Responsibility |
|---|---|
| `bundle/core/ir.js` | `Presentation` / `Slide` shape, layout list, limits, slide-count clamp |
| `bundle/core/mock.js` | Fixed 5-slide deck covering all four layouts; no quota |
| `bundle/core/validator.js` | JSON extraction (fences/prose/trailing commas), layout inference, field fallbacks, length clamps, cover guarantee |
| `bundle/core/generator.js` | Prompt, one `llm.complete` call, truncation guard, host envelope unwrap |
| `bundle/core/layout.js` | Theme (colour + type scale), shared geometry, line estimation, `fitFontSize`, `layoutSlide` |
| `bundle/core/render-web.js` | Layout spec → 1280×720 absolutely positioned HTML |
| `bundle/core/render-pptx.js` | The same layout spec → PptxGenJS shapes and editable text |
| `bundle/app.js` | Controller only: UI state, nav, generate, export, logging |

`zod` was removed. The validator is a hand-written module that runs unchanged in the browser and in
Node, so the same code is exercised by tests and production.

## 2. Design decisions

- **Content / visual split.** The model returns only semantic fields and a layout name. It cannot
  emit coordinates, CSS, or code. Unknown layouts are inferred from the present fields
  (`steps` → process, `left`/`right` → compare, `bullets` → bullets).
- **One geometry, two renderers.** `layoutSlide` returns nodes in inches on a 13.333 × 7.5 in
  canvas. The web renderer multiplies by 96 dpi and the PPTX renderer passes inches straight to
  PptxGenJS, so preview and export share margins, type scale and colours.
- **Overflow control.** `fitFontSize` estimates wrapped lines (Latin + CJK widths), then shrinks
  the font in 0.5 pt steps down to a per-role minimum. Text boxes are clipped as a last resort.
  No measured font metrics are used; estimates are deliberately conservative.
- **One LLM call.** No retries, no agent loop. A `stopReason` of `maxTokens`/`length` produces a
  clear truncation error instead of a parse failure. `maxTokens = min(4096, 600 + 300 × slides)`.
- **Robust validation.** Fenced JSON, prose around JSON, trailing commas, duplicate bullets,
  missing headings/points, unknown layouts, and overlong fields are all normalized rather than
  thrown away. A deck without a cover gets one prepended.
- **Quota discipline.** The UI exposes a mock deck so UI work needs no Anna calls. Every real call
  logs model, latency, tokens and `_meta.quotaConsumed`.

## 3. Tests

```bash
npm test        # node --test test/*.test.js
```

Result: **20 / 20 passing**.

- `validator.test.js` — fenced/prose JSON, trailing-comma repair, layout inference, dedupe,
  clamping, cover insertion, slide-count clamp.
- `layout.test.js` — mock deck covers all four layouts; every node stays inside the canvas;
  every text node's estimated height fits its box; `fitFontSize` respects its minimum.
- `web.test.js` — 1280×720 stage and HTML escaping of untrusted model text.
- `pptx.test.js` — real PptxGenJS output: ZIP magic, > 20 KB, one `ppt/slides/slideN.xml` per
  slide, and `<a:t>` text on slide 2 (proves editable text, not an image).
- `generator.test.js` — exactly one host call, `{ok,result}` envelope handling, truncation rejected
  without a retry, empty topic rejected before the host is touched.

`anna-app validate` → ✓ passed.

## 4. Browser verification (real harness, not mocked)

### Mock deck — zero quota

- `Load mock deck` renders cover, bullets, compare, process (5 slides) with page navigation.
- Export: **105,378 bytes**, `upload.inline ok`, download link appeared, no error status.

### Real Anna LLM — one call

| Field | Value |
|---|---|
| Topic | "Why daily shipping beats quarterly planning" |
| Requested slides | 4 |
| Model | `xiaomi/mimo-v2.5` |
| Latency | 12,623 ms |
| Tokens | in 234 / out 283 |
| **Quota** | **0.09655172413793102 CU** |
| Layouts returned | cover, bullets, compare, process |
| Export | 60,140 bytes, `upload.inline ok`, `GET download_url` HTTP 200 |

The real response passed the same validator → layout → preview → PPTX chain as the mock deck.

### Quota log

| Phase | CU |
|---|---|
| Phase 0 real call | 0.1422413793103448 |
| Phase 1 real call | 0.09655172413793102 |
| **Total** | **0.23879310344827582 / 1000** |

## 5. Open items / limits

1. **Installed-window save.** Export was verified in the local harness iframe with real staging
   R2. The save dialog in an *installed* staging window is still unverified; if the anchor click is
   blocked, the user still has the visible download link. The documented host-mediated alternative
   remains `files.download` with an R2 CSP allow-list.
2. **No automatic retry.** A malformed response surfaces a typed error and the user can retry
   manually; this keeps quota predictable.
3. **Estimate-based fitting.** Text fitting is conservative but not glyph-exact. Long unbroken
   strings (URLs) rely on `word-break`/clipping.
4. **Not pushed/cut.** The new bundle exists locally only. `apps push`, version cut, listing and
   review are Phase 2 work and require explicit approval.
