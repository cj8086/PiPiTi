# AGENTS.md — PiPiTi

## Project

- **Name:** PiPiTi
- **Subtitle:** AI Presentation Maker
- **Slogan:** Your ideas, beautifully presented.
- **Attribution:** Built for the TalentSec Coding Challenge
- **Repository:** `pipiti`
- **Anna App:** slug `pipiti` (staging app id `296`)

PiPiTi is a submission for the TalentSec (螣龙安科) daily-intern coding challenge: a genuinely
usable AI PPT app built on the Anna **staging** platform, using Anna's own AI capability, tested
on staging, and published so other users can install it. The 1000-CU platform allowance is part
of the evaluation.

## Product goal

Turn a topic / rough notes into a structured, previewable, **editable PPTX** deck:

```
User input → Anna LLM → structured slide JSON → validation → layout engine
          → in-browser preview → editable PPTX → Anna file channel → download
```

MVP scope (Phase 1):

1. Text input (topic or raw notes).
2. Slide-count control.
3. One-click generation through Anna LLM.
4. In-app preview with page navigation.
5. Four layouts: cover, bullets, two-column compare, process.
6. Export a real, editable `.pptx`.
7. Run for real on Anna staging.

Explicit non-goals for MVP: autonomous agent, web search, AI image generation, free-form drag
editor, custom backend, database, collaboration.

## Time budget

Total 8 hours; a runnable MVP within the first 3 hours. Prefer the smallest end-to-end path.

## Architecture (current)

- **No backend.** Pure static SPA bundle (`bundle/`) rendered in Anna's sandboxed iframe.
- **Anna App SDK** (`AnnaAppRuntime`) for host RPC: `llm.complete`, `upload.inline`, `storage`,
  `window`.
- **No bundler yet.** Native ESM + vendored UMD `PptxGenJS` (`bundle/vendor/pptxgen.bundle.js`),
  because the bundle CSP only allows `script-src 'self'` and the SDK origin.
- Slide JSON is validated by hand-written modules in `bundle/core/` (no `zod`): `ir.js` (Slide
  IR), `validator.js`, `generator.js`, `layout.js`, `render-web.js`, `render-pptx.js`, `mock.js`.
  `bundle/app.js` is a controller only.
- Rendering: `layoutSlide()` produces one inch-based spec; the HTML renderer scales it to 1280×720
  and the PptxGenJS renderer consumes the same spec, so preview and export share geometry, type
  scale and colours.
- Downloads: PPTX rendered in-browser → `upload.inline` (host RPC, no browser-to-R2 PUT, so no
  CSP `connect-src` change needed) → presigned `download_url`.

## Platform constraints that shape the design

- App manifests are `schema: 4`; `ui.bundle` + `ui.views` are required for a windowed app.
- The iframe CSP base is `default-src 'none'`, `script-src 'self'`, `connect-src 'self'`.
  No CDN scripts; vendor everything into `bundle/`.
- Bundle limits: 50 MB total, 2,000 files, 10 MB per file.
- `llm.complete` sync path caps output at 8192 tokens; long output must use `llm.stream`.
- `upload.inline` accepts up to 20 MiB base64 (~8 MiB raw practical).
- `storage.*` (APS) is key-value; runtime_state legacy path caps at 256 KB.
- Installing the App is the consent; there are no per-method host-API grants. Only credentials,
  cross-app storage scopes, and local-device agent tools need manifest declarations.
- `files.download` is the documented host-mediated save dialog; a bare `<a download>` inside the
  sandboxed iframe is not guaranteed to work. **Unverified in an installed staging window.**

## Engineering constraints

- Never call an external LLM API; all AI must go through Anna.
- Never commit tokens, cookies, PATs, or login credentials. `.home/` (project-local HOME used to
  work around a local sandbox restriction) and `~/.config/anna/credentials.json` are ignored.
- `.nvmrc` pins Node 22; do not change the nvm global default.
- All project deps live locally in `node_modules`; only `@anna-ai/cli` is global (official
  install method).
- Keep `package-lock.json` committed.
- Do not describe mock-data runs as real platform tests. Mark unverified behaviour explicitly.

## Current phase

**Phase 0 — complete** (initialization + feasibility). Results, real-call records and open risks
are in [docs/phase0.md](docs/phase0.md).

**Phase 1 — complete** (core engine). Slide IR, one-call generator, validator, four layouts,
shared web/PPTX renderers, mock deck; 20/20 Node tests; mock and real LLM decks previewed and
exported in the local staging harness. Details and quota log in [docs/phase1.md](docs/phase1.md).

**Phase 2 — complete** (MVP UI + integration). Creation and Presentation views, warm visual theme,
thumbnail/page navigation, guarded generation/export, mock UI verification and one real 6-slide
Anna staging-harness run are recorded in [docs/phase2.md](docs/phase2.md). The real run used
`xiaomi/mimo-v2.5`, consumed `0.13017241379310343 CU`, and exported a 117,184-byte editable PPTX.

Phase 2 stopped after MVP verification: no `apps push`, no version cut, no review submission, no
release. The installed-window save dialog and manual PowerPoint/WPS opening remain unverified. Do
not add post-MVP features without a new request.
