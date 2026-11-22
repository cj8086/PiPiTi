// PPTX renderer: same layout spec as the web renderer, fed to PptxGenJS.
// Text stays real, editable PowerPoint text (no images, no canvas).

import { SLIDE, layoutSlide } from "./layout.js";

export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** PptxGenJS expects colours as "RRGGBB" without the leading "#". */
function hex(color) {
  return String(color || "#000000").replace("#", "").toUpperCase();
}

function addElement(pptx, slide, el) {
  if (el.type === "rect") {
    slide.addShape(pptx.ShapeType.rect, {
      x: el.x,
      y: el.y,
      w: el.w,
      h: el.h,
      fill: el.fill ? { color: hex(el.fill) } : { type: "none" },
      line: el.line
        ? { color: hex(el.line), width: el.lineWidth || 1 }
        : { type: "none" },
    });
    return;
  }

  // margin:0 + fit:"none": layout.js already sized the font to fit the box,
  // so PptxGenJS must not add padding or re-shrink the text.
  const options = {
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    fontFace: el.fontFace,
    fontSize: el.fontSize,
    bold: Boolean(el.bold),
    color: hex(el.color),
    align: el.align || "left",
    valign: el.valign || "top",
    lineSpacingMultiple: el.lineSpacing || 1.2,
    charSpacing: el.charSpacing || 0,
    margin: 0,
    fit: "none",
  };

  if (el.paragraphs) {
    const runs = el.paragraphs.map((text) => ({
      text,
      options: {
        ...(el.bullet ? { bullet: true } : {}),
        breakLine: true,
      },
    }));
    slide.addText(runs, options);
  } else {
    slide.addText(el.text ?? "", options);
  }
}

/**
 * Build a PptxGenJS instance from a deck.
 * @param {object} deck validated Presentation
 * @param {Function} PptxCtor window.PptxGenJS or the npm module
 */
export function buildPptx(deck, PptxCtor) {
  if (typeof PptxCtor !== "function") {
    throw new Error("PptxGenJS is not loaded");
  }
  const pptx = new PptxCtor();
  // Register the same 16:9 inch geometry the layout engine uses.
  pptx.defineLayout({ name: "PIPITI_16X9", width: SLIDE.width, height: SLIDE.height });
  pptx.layout = "PIPITI_16X9";
  pptx.author = "PiPiTi";
  pptx.company = "TalentSec Coding Challenge";
  pptx.subject = deck.title;
  pptx.title = deck.title;

  deck.slides.forEach((slide, index) => {
    const spec = layoutSlide(slide, index, deck.slides.length);
    const target = pptx.addSlide();
    target.background = { color: hex(spec.background) };
    spec.elements.forEach((el) => addElement(pptx, target, el));
  });

  return pptx;
}
