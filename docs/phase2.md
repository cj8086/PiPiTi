# Phase 2 — MVP UI & Integration

Date: 2026-11-22 · Environment: macOS (arm64), Anna staging harness (local, port 5180)

Phase 2 integrated the Phase 1 engine into a complete two-view MVP. No generation or rendering
engine was rewritten, and no post-MVP features were added.

## 1. Delivered UI

- **Creation View:** PiPiTi brand and slogan, topic/raw-material textarea, slide count (default 6,
  clamped to 2–8), Generate Presentation button, live generation status and error messages.
- **Presentation View:** numbered slide thumbnails, shared 16:9 preview, previous/next navigation,
  New Presentation and Export PPTX actions.
- Warm paper background, dark typography and restrained orange accents; no gradient or decorative
  card stack. The same warm theme is used by the shared web/PPTX slide spec.
- `?mock=1` is a development-only sample route. It is not a product button and consumes no Anna
  quota. The controller remains in `bundle/app.js`; `bundle/core/` remains the engine.

## 2. Local checks

```bash
npm test
anna-app validate
git diff --check
```

Results: **20 / 20 Node tests passed**, manifest validation passed, and whitespace validation
passed.

### Mock UI verification (zero quota)

The bundled 5-slide sample was exercised through real browser interactions:

- Five thumbnails and page numbers rendered; cover, bullets, compare and process layouts were all
  visited.
- Next/previous navigation and thumbnail jumping updated the active slide. Previous was disabled
  on slide 1 and Next was disabled on slide 5.
- A double-click on Export PPTX was guarded by the exporting state. One 105,378-byte standalone
  Blob PPTX was produced and the visible Download PPTX fallback appeared.
- New Presentation returned to Creation View, cleared the topic, restored 6 slides and removed the
  old thumbnails.
- Empty submission showed `Enter a topic or paste your notes first.` and focused the textarea.
  Submission without a Host showed a clear connection error without calling an LLM.

## 3. Real Anna staging-harness E2E

This was a real Host RPC session in `anna-app dev`, using the real staging LLM and staging R2. It
was **not** a claim about an installed production/staging window.

| Field | Result |
|---|---|
| Topic | `ai tools for teams` |
| Requested slides | 6 (default) |
| Model | `xiaomi/mimo-v2.5` |
| UI-measured latency | 19,154 ms |
| Tokens | input 232 / output 422 / total 654 |
| Stop reason | `endTurn` |
| **Quota consumed** | **0.13017241379310343 CU** |
| Preview | All 6 slides visited; cover, bullets, compare and process present |
| PPTX rendered | 117,184 bytes |
| `upload.inline` | Success; staging R2 reported 117,184 bytes |
| Download | Presigned URL opened in a new tab; in-app GET returned HTTP 200, 117,184 bytes |

The downloaded file was independently inspected as a ZIP/OOXML package: ZIP magic `PK\x03\x04`,
exactly 6 `ppt/slides/slideN.xml` parts and 61 `<a:t>` text runs. This confirms real editable text
runs rather than a flattened slide image. No signed URL, session token or credential is stored in
this record.

## 4. Quota log

| Phase | CU |
|---|---:|
| Phase 0 real call | 0.1422413793103448 |
| Phase 1 real call | 0.09655172413793102 |
| Phase 2 real call | 0.13017241379310343 |
| **Total** | **0.36896551724137925 / 1000** |

## 5. Remaining verification limits

1. The save dialog in an **installed** staging App window remains unverified. The harness did
   verify the automatic presigned-URL navigation and visible download fallback.
2. The PPTX package and editable text runs were checked programmatically; manually opening the
   file in PowerPoint or WPS was not performed.
3. Phase 2 did not run `apps push`, cut a version, submit review or release. No new feature work
   follows this MVP record.
