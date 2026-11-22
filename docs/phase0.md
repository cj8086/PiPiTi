# Phase 0 — Initialization & Feasibility

Date: 2026-11-22 · Environment: macOS (arm64), staging host `https://staging.anna.partners`

Phase 0 verified the smallest possible end-to-end chain on the real staging platform. It did
**not** build the full product, cut a version, or submit for review.

## 1. Local environment

| Tool | Version | Notes |
|---|---|---|
| Node.js | v22.19.0 (nvm) | Already installed; `.nvmrc` = `22`; global default untouched |
| npm | 10.9.3 | |
| uv | 0.13.9 | Installed with the official `astral.sh` script |
| `anna-app` CLI | 0.1.64 | `npm i -g @anna-ai/cli` inside nvm Node 22 |
| Python runtime | 3.10.22 (uv-managed) | Pulled by `uvx anna-app-runtime-local@0.2.0a33` |
| Git | 2.54.0 | Repo initialized locally |

Root `package.json` keeps project dependencies local: `pptxgenjs@3.12.0`, `zod@3`.

## 2. Anna CLI authentication

```bash
anna-app login --host https://staging.anna.partners
```

Device flow completed; PAT written to `~/.config/anna/credentials.json` (mode 600, `aps:dev`,
~90 days). No credential was committed.

## 3. Scaffold

```bash
anna-app init . --slug pipiti --force
anna-app validate          # ✓ passed (schema 4, dispatcher 0.33.0)
```

The generated Python Executa was removed — PiPiTi is a bundle-only app using the Host API, so
`required_executas` is intentionally empty (allowed for `schema ≥ 2`).

## 4. Running the harness

```bash
anna-app dev --slug pipiti --port 5180
```

Observed real boot state:

```
llm bridge        real → app_slug=pipiti
storage backend   legacy (in-memory runtime_state)
web backend       local (keyless ddgs + stdlib SSRF fetcher, unbilled)
✓ dashboard http://localhost:5180/
```

Notes / environment-only workarounds:

- The system sandbox denied writes to `~/.anna-app` (dev signing key), so the harness was started
  with a **project-local HOME**: `HOME=$PWD/.home`. The PAT was copied there for the CLI. `.home/`
  is gitignored and must never be committed.
- The first `uvx` resolution exceeded the CLI's 8-second bridge-ready window; pre-warming
  `uvx anna-app-runtime-local@0.2.0a33` fixed subsequent boots.
- Docs mention `anna-app dev --llm real`; CLI 0.1.64 has **no `--llm` flag** — real LLM is the
  default (`--no-llm` / `--mock-llm` disable or stub it). This is documentation drift.
- `--slug pipiti` must be explicit: the manifest has no slug field and the listing name `PiPiTi`
  is not a valid slug.

## 5. Real Anna LLM call (verified)

One real generation through the staging bridge, driven from the iframe UI:

| Field | Value |
|---|---|
| Request | 4-slide deck, topic “Small teams ship faster”, `maxTokens: 2000`, `temperature: 0.4` |
| Model reported | `xiaomi/mimo-v2.5` |
| Latency | 8,279 ms |
| Tokens | input 188 / output 496 |
| **Quota consumed** | **0.1422413793103448 CU** (`_meta.quotaConsumed`) |
| Result | Valid deck JSON, normalizer accepted 4 slides |

This is the only billed LLM call in Phase 0. Total spend: **0.1422 CU** of 1000.

## 6. PPTX export (verified with real bytes)

Path exercised in the harness (real host RPC + real staging R2, not mocked):

1. PptxGenJS renders 4 slides in the browser → 87,758-byte `.pptx`.
2. `anna.upload.inline({ filename, mime_type, content_b64, purpose: "user_artifact" })` →
   `r2_key`, `bytes_size: 87758`, presigned `download_url` (1800 s).
3. `GET download_url` → **HTTP 200, 87,758 bytes**.
4. Downloaded file inspected locally:
   - valid ZIP/OOXML container;
   - exactly **4** `ppt/slides/slideN.xml`;
   - slide text present as real `<a:t>` runs, e.g. *“Why Small Teams Win / Fewer handoffs mean
     decisions happen in hours…”* — i.e. editable text, not an image.

**Not verified:** the actual save dialog in an *installed* staging app window. Inside the
sandboxed iframe a plain `<a download>` click may be blocked. The documented host-mediated save is
`anna.files.download` (APS), which expects an APS object — writing one needs a browser→R2 PUT
(`files.upload_init` + PUT + `files.upload_finalize`) and a CSP `connect-src` allow-list for the R2
host. That trade-off is deferred to Phase 1 and must be tested on a real installed draft.

The exact exported file is kept at [artifacts/pipiti-sample.pptx](artifacts/pipiti-sample.pptx)
(87,758 bytes) so the editability claim can be checked in PowerPoint / Keynote.

## 7. Upload / version / review pipeline (confirmed, partially exercised)

```bash
anna-app apps push          # ✓ exercised on staging
```

Result: app id `296`, status `draft`, working bundle staged — 4 files, 489.5 KB, `status=ready`.
No version was cut.

Remaining lifecycle (confirmed from CLI help + official docs, **not executed**):

```
DRAFT ──apps cut <semver>──▶ immutable version
      ──apps submit-review──▶ PENDING_REVIEW
      ──admin approve──────▶ APPROVED
      ──apps release <ver>──▶ PUBLISHED (App Store, installable)
```

Pre-flight for review: Listing fields (name, tagline, description, logo, screenshots), at least one
cut version, `anna-app validate` green, bundle `bundle_ready`, and a self-test of the installed app
end-to-end.

## 8. Risks / blockers for delivery

1. **Production download UX (highest).** `upload.inline` gives a presigned URL, but the iframe may
   not be allowed to trigger a save. Decide in Phase 1: APS `files.download` (needs R2 CSP
   allow-list, environment-specific host) vs. a documented in-app fallback.
2. **Local dev key path.** `~/.anna-app` is blocked by this machine's sandbox; the project-local
   HOME workaround is required locally but is *not* a platform issue.
3. **Doc drift** around `--llm real` and slug derivation — follow `anna-app --help` over docs when
   they disagree.
4. **JSON robustness.** A single malformed response kills generation; Phase 1 needs one retry and a
   `stopReason === "maxTokens"` guard.
5. **Quota discipline.** One 4-slide deck costs ~0.14 CU; larger decks / retries multiply this.
   Keep `maxTokens` tight and avoid agent sessions for generation.
6. **Review latency.** No SLA; cut a version early enough to leave buffer before the 8-hour limit.

## 9. Recommended Phase 1 plan

1. Harden generation: strict schema + retry, truncation detection, 2–8 slide clamp.
2. Ship the four layouts with consistent preview/export parity (already scaffolded).
3. Solve save UX with `files.download` on an installed draft; verify on staging, not just locally.
4. Fill Listing fields + screenshots; `apps cut 0.1.0`; `submit-review`; keep buffer for rejection.
5. Track CU per generation in the UI (already logged) and keep a spend log.

## 10. Key official docs

- Developer hub: https://staging.anna.partners/developers
- Docs index: https://staging.anna.partners/llms.txt · full: https://staging.anna.partners/llms-full.txt
- App quickstart: `/developers/apps/app-quickstart`
- App manifest: `/developers/apps/app-manifest`
- App UI manifest: `/developers/apps/app-ui-manifest`
- App UI SDK: `/developers/apps/app-ui-sdk`
- Host API: `/developers/apps/app-ui-host-api`
- LLM & agent: `/developers/apps/llm-and-agent`
- Local dev: `/developers/apps/local-dev` · LLM dev: `/developers/apps/local-dev-llm`
- Bundle pipeline: `/developers/apps/app-ui-bundle`
- Publishing: `/developers/apps/app-publish` · Versioning: `/developers/apps/app-versioning`

Tip: append `.md` to any `/developers/**` URL (or send `Accept: text/markdown`) for raw Markdown.
