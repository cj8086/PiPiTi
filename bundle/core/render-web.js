// Web renderer: layout spec (inches) -> absolutely positioned HTML.
// The stage is always 1280x720 (96 dpi); the controller scales it to the
// preview container, so web preview and PPTX share one geometry.

// The layout spec is inch/pt based; CSS needs px at the stage's fixed 96 dpi.
const PX_PER_IN = 96;
const PT_TO_PX = 96 / 72;

function px(value) {
  return Math.round(value * PX_PER_IN * 100) / 100;
}

function pts(value) {
  return Math.round(value * PT_TO_PX * 100) / 100;
}

/** Every model-derived string passes through here before reaching innerHTML. */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
}

function renderRect(el) {
  const border = el.line
    ? `${pts(el.lineWidth || 1)}px solid ${el.line}`
    : "none";
  return (
    `<div class="node box" style="left:${px(el.x)}px;top:${px(el.y)}px;` +
    `width:${px(el.w)}px;height:${px(el.h)}px;background:${el.fill || "transparent"};` +
    `border:${border};"></div>`
  );
}

function renderText(el) {
  // Text nodes are flex columns (see .stage .node.text in styles.css), so
  // vertical alignment maps to justify-content.
  const justify =
    el.valign === "middle" ? "center" : el.valign === "bottom" ? "flex-end" : "flex-start";
  const style = [
    `left:${px(el.x)}px`,
    `top:${px(el.y)}px`,
    `width:${px(el.w)}px`,
    `height:${px(el.h)}px`,
    `font-family:${el.fontFace}, Helvetica, sans-serif`,
    `font-size:${pts(el.fontSize)}px`,
    `font-weight:${el.bold ? 700 : 400}`,
    `color:${el.color}`,
    `text-align:${el.align || "left"}`,
    `line-height:${el.lineSpacing || 1.2}`,
    `justify-content:${justify}`,
    el.charSpacing ? `letter-spacing:${pts(el.charSpacing)}px` : "",
  ]
    .filter(Boolean)
    .join(";");

  let body;
  if (el.paragraphs) {
    if (el.bullet) {
      body = `<ul>${el.paragraphs.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`;
    } else {
      body = el.paragraphs
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("");
    }
  } else {
    body = `<div class="plain">${escapeHtml(el.text ?? "")}</div>`;
  }

  return `<div class="node text" style="${style};">${body}</div>`;
}

/** Render one layout spec into a self-contained stage element. */
export function renderSlideHtml(spec) {
  const nodes = spec.elements
    .map((el) => (el.type === "rect" ? renderRect(el) : renderText(el)))
    .join("");
  return (
    `<div class="stage" data-layout="${spec.layout}" ` +
    `style="width:${Math.round(spec.width * PX_PER_IN)}px;` +
    `height:${Math.round(spec.height * PX_PER_IN)}px;` +
    `background:${spec.background};">${nodes}</div>`
  );
}
