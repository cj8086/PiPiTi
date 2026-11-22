# PiPiTi

**Your ideas, beautifully presented.**

PiPiTi is a lightweight AI presentation maker built as an Anna App for the TalentSec Coding
Challenge. Give it a topic or rough notes, choose a slide count, and it generates a structured
deck with Anna's LLM, previews every slide, and exports a genuinely editable `.pptx`.

## Stack

- Static SPA bundle rendered in Anna's sandboxed iframe (no backend)
- Anna App SDK: `llm.complete`, `upload.inline`, `storage`, `window`
- PptxGenJS (vendored, `bundle/vendor/`) for browser-side PPTX generation
- Node 22 (`.nvmrc`), `uv` for the Anna local runtime

## Layouts

`cover` · `bullets` · `compare` (two columns) · `process` (steps)

Core engine: `bundle/core/` — Slide IR, one-call Anna generator, validator, shared inch-based
layout spec consumed by both the HTML preview and the PptxGenJS export. The MVP controller in
`bundle/app.js` provides Creation and Presentation views, thumbnail navigation, guarded generation
and PPTX export. For zero-quota UI development, open the dev app with `?mock=1`.

## Develop

```bash
nvm use                      # Node 22
npm install                  # local project deps
npm test                     # validator / layout / renderer / PPTX tests
anna-app login --host https://staging.anna.partners
anna-app validate
anna-app dev --slug pipiti   # http://localhost:5180/
```

On this machine the sandbox blocks `~/.anna-app`, so the harness is started with a project-local
HOME:

```bash
export HOME="$PWD/.home"
anna-app dev --slug pipiti
```

## Publish

```bash
anna-app apps push            # working draft + bundle
anna-app apps cut 0.1.0       # immutable version
anna-app apps submit-review   # admin review
anna-app apps release 0.1.0   # go live after approval
```

See [AGENTS.md](AGENTS.md) for project constraints, [docs/phase0.md](docs/phase0.md) for the
platform feasibility record, [docs/phase1.md](docs/phase1.md) for the core engine, and
[docs/phase2.md](docs/phase2.md) for MVP UI verification, the real staging-harness run and quota
usage.

Built for the TalentSec Coding Challenge.
