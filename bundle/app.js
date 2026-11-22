// PiPiTi — MVP controller.
// Creation View -> one Anna LLM call -> Presentation View -> editable PPTX.

// Absolute URL served by the Anna host/harness, not part of this bundle —
// keeps the SPA dependency-free while still getting the SDK inside the iframe.
import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";
import { generateDeck, unwrapHostResult } from "./core/generator.js";
import { layoutSlide } from "./core/layout.js";
import { mockDeck } from "./core/mock.js";
import { buildPptx, PPTX_MIME } from "./core/render-pptx.js";
import { renderSlideHtml } from "./core/render-web.js";

// Single mutable app state; the UI is re-rendered imperatively from it.
const state = {
  anna: null, // AnnaAppRuntime handle once connect() succeeds
  deck: null, // validated Presentation (canonical Slide IR)
  idx: 0, // currently selected slide index
  source: "mock", // "mock" | "anna": where the current deck came from
  usage: [], // per-generation LLM meta, kept for quota accounting
  view: "creation", // "creation" | "presentation"
  isGenerating: false, // re-entrancy guard for generate()
  isExporting: false, // re-entrancy guard for exportPptx()
  objectUrl: null, // active Blob URL from standalone export (revoked on reset)
};

const $ = (id) => document.getElementById(id);
const LAYOUT_LABELS = {
  cover: "Cover",
  bullets: "Key points",
  compare: "Comparison",
  process: "Process",
};

/** Mirror a line into both logs: the creation-view log and the
 * presentation-view "Generation details" panel. */
function log(line) {
  for (const id of ["log", "activityLog"]) {
    const el = $(id);
    el.textContent += (el.textContent ? "\n" : "") + line;
    el.scrollTop = el.scrollHeight;
  }
  $("log").classList.remove("hidden");
}

function clearLogs() {
  $("log").textContent = "";
  $("activityLog").textContent = "";
  $("log").classList.add("hidden");
}

function setStatus(text, kind = "") {
  $("status").textContent = text;
  $("status").className = `status ${kind}`.trim();
}

function setExportStatus(text, kind = "") {
  $("exportStatus").textContent = text;
  $("exportStatus").className = `status ${kind}`.trim();
}

function formatBytes(bytes) {
  return `${(Number(bytes) / 1024).toFixed(1)} KB`;
}

// Stages render at a fixed 1280×720 (see render-web.js) and are scaled down
// with a CSS transform to fit their container (main canvas or thumbnail),
// so preview geometry stays identical everywhere.
function fitAllStages() {
  document.querySelectorAll(".canvas, .thumbnail-frame").forEach((container) => {
    const stage = container.querySelector(".stage");
    if (!stage || !container.clientWidth) return;
    stage.style.transform = `scale(${container.clientWidth / stage.offsetWidth})`;
  });
}

function renderThumbnails() {
  const { deck } = state;
  const fragment = document.createDocumentFragment();

  deck.slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "thumbnail";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `Slide ${index + 1}: ${slide.title}`);

    const number = document.createElement("span");
    number.className = "thumbnail-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const frame = document.createElement("span");
    frame.className = "thumbnail-frame";
    frame.innerHTML = renderSlideHtml(layoutSlide(slide, index, deck.slides.length));

    button.append(number, frame);
    button.addEventListener("click", () => selectSlide(index));
    fragment.append(button);
  });

  $("thumbnails").replaceChildren(fragment);
}

function renderSlide() {
  const { deck } = state;
  if (!deck?.slides?.length) return;
  state.idx = Math.min(Math.max(0, state.idx), deck.slides.length - 1);

  const slide = deck.slides[state.idx];
  const total = deck.slides.length;
  $("layoutLabel").textContent = LAYOUT_LABELS[slide.layout] || slide.layout;
  $("pageLabel").textContent = `${state.idx + 1} / ${total}`;
  $("canvas").innerHTML = renderSlideHtml(layoutSlide(slide, state.idx, total));
  $("prevBtn").disabled = state.idx === 0;
  $("nextBtn").disabled = state.idx === total - 1;

  document.querySelectorAll(".thumbnail").forEach((button, index) => {
    const active = index === state.idx;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });

  requestAnimationFrame(fitAllStages);
}

function showDeck(deck, source) {
  state.deck = deck;
  state.source = source;
  state.idx = 0;
  state.view = "presentation";

  $("creationView").classList.add("hidden");
  $("presentationView").classList.remove("hidden");
  $("presentationActions").classList.remove("hidden");

  $("deckTitle").textContent = deck.title;
  $("deckMeta").textContent = `${deck.slides.length} slides · ${source === "anna" ? "Anna AI" : "Sample deck"
    }`;
  $("exportBtn").disabled = false;
  $("newBtn").disabled = false;
  $("downloadLink").classList.add("hidden");
  setExportStatus("Editable text and shapes · 16:9 PowerPoint");

  renderThumbnails();
  renderSlide();
}

function showCreation() {
  if (state.isGenerating || state.isExporting) return;

  state.view = "creation";
  state.deck = null;
  state.idx = 0;
  $("topic").value = "";
  $("slideCount").value = "6";
  $("presentationView").classList.add("hidden");
  $("creationView").classList.remove("hidden");
  $("presentationActions").classList.add("hidden");
  $("thumbnails").replaceChildren();
  $("canvas").replaceChildren();
  $("downloadLink").classList.add("hidden");
  clearLogs();

  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }

  setStatus(
    state.anna
      ? "Enter a topic to get started."
      : "Anna host unavailable. Add ?mock=1 to preview the sample deck.",
    state.anna ? "" : "error"
  );
  $("topic").focus();
}

function selectSlide(index) {
  if (!state.deck || index < 0 || index >= state.deck.slides.length) return;
  if (index === state.idx) return;
  state.idx = index;
  renderSlide();
}

async function generate(event) {
  event?.preventDefault();
  if (state.isGenerating) return;

  const topic = $("topic").value.trim();
  if (!topic) {
    setStatus("Enter a topic or paste your notes first.", "error");
    $("topic").focus();
    return;
  }
  if (!state.anna) {
    setStatus("Anna is not connected. Please reopen the app and try again.", "error");
    return;
  }

  // Mirrors LIMITS.minSlides/maxSlides from core/ir.js.
  const count = Math.min(8, Math.max(2, Number($("slideCount").value) || 6));
  $("slideCount").value = String(count);
  state.isGenerating = true;
  $("generateBtn").disabled = true;
  $("generateBtn").textContent = "Generating…";
  $("generateForm").setAttribute("aria-busy", "true");
  setStatus("Anna is organizing your ideas into slides…");
  log(`Generating a ${count}-slide deck through Anna LLM…`);

  try {
    const { deck, meta } = await generateDeck(state.anna, {
      topic,
      slideCount: count,
    });
    state.usage.push(meta);

    const usage = meta.usage || {};
    log(
      `LLM ok · ${meta.model || "?"} · ${meta.latencyMs}ms · in ${usage.inputTokens ?? "?"
      } / out ${usage.outputTokens ?? "?"} · quota ${meta.quotaConsumed ?? "?"} CU`
    );
    const total = state.usage.reduce(
      (sum, item) => sum + (Number(item.quotaConsumed) || 0),
      0
    );
    log(`Quota this session · ${total.toFixed(4)} CU`);
    showDeck(deck, "anna");
  } catch (error) {
    log(`Generation error · ${error.code || ""} ${error.message}`);
    setStatus(`Generation failed: ${error.message}`, "error");
  } finally {
    state.isGenerating = false;
    $("generateBtn").disabled = false;
    $("generateBtn").textContent = "Generate Presentation";
    $("generateForm").removeAttribute("aria-busy");
  }
}

/** Decoded byte size computed from the base64 length, without decoding it. */
function base64Bytes(b64) {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function filenameFor(deck) {
  const slug = String(deck.title || "deck")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `pipiti-${slug || "deck"}-${Date.now()}.pptx`;
}

async function exportPptx() {
  if (!state.deck || state.isExporting) return;

  const deck = state.deck;
  state.isExporting = true;
  $("exportBtn").disabled = true;
  $("newBtn").disabled = true;
  $("exportBtn").textContent = "Exporting…";
  $("downloadLink").classList.add("hidden");
  setExportStatus("Rendering editable PPTX…");

  try {
    const pptx = buildPptx(deck, window.PptxGenJS);
    const b64 = await pptx.write({ outputType: "base64" });
    const bytes = base64Bytes(b64);
    const filename = filenameFor(deck);
    log(`PPTX rendered · ${bytes} bytes · ${filename}`);

    const link = $("downloadLink");
    if (!state.anna) {
      // Standalone path (no Anna host, e.g. local dev): offer a local Blob
      // download instead of the host-mediated upload flow below.
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
      const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], {
        type: PPTX_MIME,
      });
      state.objectUrl = URL.createObjectURL(blob);
      link.href = state.objectUrl;
      link.textContent = "Download PPTX";
      link.setAttribute("download", filename);
      link.classList.remove("hidden");
      setExportStatus(`PPTX ready · ${formatBytes(bytes)}`, "ok");
      log("Standalone export ready as a local Blob download.");
      return;
    }

    // Anna path: hand the bytes to the host via upload.inline (no direct
    // browser→R2 PUT, so no CSP connect-src change is needed) and get back a
    // presigned download_url for the user to save.
    setExportStatus("Uploading your presentation…");
    const upload = unwrapHostResult(
      await state.anna.upload.inline({
        filename,
        mime_type: PPTX_MIME,
        content_b64: b64,
        purpose: "user_artifact",
      })
    );
    if (!upload?.download_url) throw new Error("Anna did not return a download URL");

    log(
      `upload.inline ok · ${upload.bytes_size} bytes · mime ${upload.mime_type} · key ${upload.r2_key}`
    );
    link.href = upload.download_url;
    link.textContent = "Download PPTX";
    link.removeAttribute("download");
    link.classList.remove("hidden");

    // Best-effort immediate download; the visible link remains as a fallback.
    const anchor = document.createElement("a");
    anchor.href = upload.download_url;
    anchor.download = filename;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.click();

    setExportStatus(`PPTX ready · ${formatBytes(upload.bytes_size || bytes)}`, "ok");
    log("Download URL ready; automatic download requested.");

    // Best-effort verification that the presigned URL actually serves the file.
    try {
      const response = await fetch(upload.download_url);
      const buffer = await response.arrayBuffer();
      log(`Verified download URL · HTTP ${response.status} · ${buffer.byteLength} bytes`);
    } catch (error) {
      log(`Download URL check unavailable: ${error.message}`);
    }
  } catch (error) {
    log(`Export error · ${error.code || ""} ${error.message}`);
    setExportStatus(`Export failed: ${error.message}`, "error");
  } finally {
    state.isExporting = false;
    $("exportBtn").disabled = !state.deck;
    $("newBtn").disabled = false;
    $("exportBtn").textContent = "Export PPTX";
  }
}

function wire() {
  $("generateForm").addEventListener("submit", generate);
  $("exportBtn").addEventListener("click", exportPptx);
  $("newBtn").addEventListener("click", showCreation);
  $("prevBtn").addEventListener("click", () => selectSlide(state.idx - 1));
  $("nextBtn").addEventListener("click", () => selectSlide(state.idx + 1));
  $("slideCount").addEventListener("change", () => {
    const input = $("slideCount");
    if (input.value) input.value = String(Math.min(8, Math.max(2, Number(input.value) || 6)));
  });

  // Re-fit the fixed-size stages whenever their containers resize.
  const observer = new ResizeObserver(fitAllStages);
  observer.observe($("canvas"));
  observer.observe($("thumbnails"));
}

// Boot: wire events, optionally load the mock deck (?mock=1, zero quota),
// then connect to the Anna host. A failed connect() is not fatal — the app
// still shows the creation view with a helpful status message.
async function main() {
  wire();

  // Development-only sample route; no button or quota cost in the product UI.
  if (new URLSearchParams(location.search).has("mock")) {
    log("Loaded the bundled mock deck for UI verification; no Anna quota used.");
    showDeck(mockDeck(), "mock");
  }

  try {
    state.anna = await AnnaAppRuntime.connect();
    await state.anna.window.set_title({ title: "PiPiTi — AI Presentation Maker" });
    log(`Host ready · app ${state.anna.app?.slug || "pipiti"}`);
    if (!state.deck) setStatus("Enter a topic to get started.");
  } catch (error) {
    log(`AnnaAppRuntime.connect failed: ${error.message}`);
    if (!state.deck) {
      setStatus("Anna host unavailable. Add ?mock=1 to preview the sample deck.", "error");
    }
  } finally {
    $("generateBtn").disabled = false;
  }
}

main();
