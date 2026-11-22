// Deterministic layout engine.
// Input: Slide IR. Output: a renderer-agnostic spec made of inch-based
// text/rect nodes plus a background colour. Web and PPTX renderers both
// consume this spec, so preview and export cannot drift apart.

// 16:9 canvas in inches (PowerPoint "widescreen"), shared by both renderers.
export const SLIDE = Object.freeze({
  width: 13.333,
  height: 7.5,
  marginX: 0.75,
  contentWidth: 11.833,
  footerY: 6.95,
});

export const THEME = Object.freeze({
  fontFace: "Arial",
  colors: {
    ink: "#25231F",
    muted: "#756F65",
    accent: "#D86B3C",
    accentDark: "#F0A47D",
    paper: "#FFFCF7",
    card: "#F6F0E7",
    line: "#E2D9CC",
    dark: "#252622",
    darkInk: "#FFF8EF",
    darkMuted: "#D4CABC",
    footer: "#A39A8E",
    footerDark: "#938A7D",
  },
  type: {
    kicker: 10,
    coverTitle: 40,
    coverSubtitle: 18,
    title: 30,
    bullet: 17,
    cardHeading: 16,
    cardPoint: 13,
    stepLabel: 15,
    stepDetail: 11,
    footer: 9,
  },
});

// Matches CJK ideographs / kana / Hangul / fullwidth forms, which occupy a
// full em even in a Latin font — required for correct wrapping of Chinese decks.
const CJK = /[\u2E80-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;

/** Rough per-character width in em; deliberately conservative (see countLines). */
function charEm(ch, bold) {
  if (ch === " " || ch === "\t") return 0.28;
  if (CJK.test(ch)) return 1;
  return bold ? 0.56 : 0.5;
}

/** Conservative line estimate (over-estimates slightly, which prevents overflow). */
export function countLines(text, widthIn, fontSize, bold = false) {
  const maxEm = Math.max(3, (widthIn * 72) / fontSize);
  let lines = 1;
  let used = 0;
  for (const ch of String(text ?? "")) {
    if (ch === "\n") {
      lines += 1;
      used = 0;
      continue;
    }
    const w = charEm(ch, bold);
    if (used > 0 && used + w > maxEm) {
      lines += 1;
      used = w;
    } else {
      used += w;
    }
  }
  return lines;
}

/** Largest font size (in pt) that keeps text inside the box. Never below `min`. */
export function fitFontSize(text, { w, h, size, min = 10, lineSpacing = 1.2, bold = false }) {
  const value = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  let fontSize = size;
  while (fontSize > min) {
    const needed = (countLines(value, w, fontSize, bold) * fontSize * lineSpacing) / 72;
    if (needed <= h) return round(fontSize);
    fontSize -= 0.5;
  }
  return round(Math.max(min, fontSize));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/** Fill node defaults and round geometry so web and PPTX get identical numbers. */
function textNode(node) {
  return {
    type: "text",
    fontFace: THEME.fontFace,
    align: "left",
    valign: "top",
    lineSpacing: 1.2,
    bold: false,
    charSpacing: 0,
    ...node,
    x: round(node.x),
    y: round(node.y),
    w: round(node.w),
    h: round(node.h),
    fontSize: round(node.fontSize),
  };
}

function rectNode(node) {
  return {
    type: "rect",
    line: null,
    lineWidth: 0,
    ...node,
    x: round(node.x),
    y: round(node.y),
    w: round(node.w),
    h: round(node.h),
  };
}

const KICKERS = {
  cover: "PIPITI",
  bullets: "KEY POINTS",
  compare: "COMPARISON",
  process: "PROCESS",
};

/** Build the layout spec for one slide. Pure function. */
export function layoutSlide(slide, index = 0, total = 1) {
  const c = THEME.colors;
  const t = THEME.type;
  const dark = slide.layout === "cover";
  const elements = [];
  const text = (node) => elements.push(textNode(node));
  const rect = (node) => elements.push(rectNode(node));

  // Cover slides use the dark canvas, everything else is light; the pairs
  // below pick the dark/light variant of each colour role.
  const kickerColor = dark ? c.accentDark : c.accent;
  const titleColor = dark ? c.darkInk : c.ink;
  const bodyColor = dark ? c.darkMuted : c.ink;
  const footerColor = dark ? c.footerDark : c.footer;

  // Shared kicker + footer.
  text({
    x: SLIDE.marginX + 0.03,
    y: 0.48,
    w: 6,
    h: 0.3,
    text: KICKERS[slide.layout] || "PIPITI",
    fontSize: t.kicker,
    bold: true,
    color: kickerColor,
    charSpacing: 2,
    lineSpacing: 1,
  });
  text({
    x: SLIDE.marginX,
    y: SLIDE.footerY,
    w: 7,
    h: 0.28,
    text: "PiPiTi · AI Presentation Maker",
    fontSize: t.footer,
    color: footerColor,
    lineSpacing: 1,
  });
  text({
    x: SLIDE.width - SLIDE.marginX - 1.6,
    y: SLIDE.footerY,
    w: 1.6,
    h: 0.28,
    text: `${index + 1} / ${total}`,
    fontSize: t.footer,
    color: footerColor,
    align: "right",
    lineSpacing: 1,
  });

  if (slide.layout === "cover") {
    rect({ x: 0.78, y: 1.7, w: 0.9, h: 0.055, fill: c.accentDark });
    text({
      x: SLIDE.marginX,
      y: 2.0,
      w: SLIDE.contentWidth,
      h: 1.9,
      text: slide.title || "Untitled",
      fontSize: fitFontSize(slide.title || "Untitled", {
        w: SLIDE.contentWidth,
        h: 1.9,
        size: t.coverTitle,
        min: 26,
        lineSpacing: 1.12,
        bold: true,
      }),
      bold: true,
      color: titleColor,
      lineSpacing: 1.12,
      valign: "top",
    });
    if (slide.subtitle) {
      text({
        x: SLIDE.marginX,
        y: 4.15,
        w: 10,
        h: 1.3,
        text: slide.subtitle,
        fontSize: fitFontSize(slide.subtitle, {
          w: 10,
          h: 1.3,
          size: t.coverSubtitle,
          min: 13,
          lineSpacing: 1.35,
        }),
        color: c.darkMuted,
        lineSpacing: 1.35,
      });
    }
    return finish(elements, dark, slide.layout);
  }

  // Standard title.
  text({
    x: SLIDE.marginX,
    y: 0.95,
    w: SLIDE.contentWidth,
    h: 0.85,
    text: slide.title || "Untitled slide",
    fontSize: fitFontSize(slide.title || "Untitled slide", {
      w: SLIDE.contentWidth,
      h: 0.85,
      size: t.title,
      min: 20,
      lineSpacing: 1.12,
      bold: true,
    }),
    bold: true,
    color: titleColor,
    lineSpacing: 1.12,
  });

  if (slide.layout === "compare") {
    const gap = 0.35;
    const cardW = (SLIDE.contentWidth - gap) / 2;
    const cardY = 2.1;
    const cardH = 4.3;
    [slide.left, slide.right].forEach((column, i) => {
      const x = SLIDE.marginX + i * (cardW + gap);
      rect({ x, y: cardY, w: cardW, h: cardH, fill: c.card, line: c.line, lineWidth: 1 });
      const heading = column?.heading || (i === 0 ? "Left" : "Right");
      text({
        x: x + 0.3,
        y: cardY + 0.25,
        w: cardW - 0.6,
        h: 0.5,
        text: heading,
        fontSize: fitFontSize(heading, {
          w: cardW - 0.6,
          h: 0.5,
          size: t.cardHeading,
          min: 11,
          lineSpacing: 1.1,
          bold: true,
        }),
        bold: true,
        color: c.accent,
        lineSpacing: 1.1,
      });
      const points = (column?.points || []).filter(Boolean);
      if (points.length) {
        text({
          x: x + 0.3,
          y: cardY + 0.92,
          w: cardW - 0.6,
          h: 3.2,
          paragraphs: points,
          bullet: true,
          fontSize: fitFontSize(points, {
            w: cardW - 0.85,
            h: 3.15,
            size: t.cardPoint,
            min: 9,
            lineSpacing: 1.35,
          }),
          color: c.ink,
          lineSpacing: 1.35,
        });
      }
    });
    return finish(elements, dark, slide.layout);
  }

  if (slide.layout === "process") {
    const steps = slide.steps.slice(0, 5);
    if (steps.length) {
      const gap = 0.28;
      const w = (SLIDE.contentWidth - gap * (steps.length - 1)) / steps.length;
      steps.forEach((step, i) => {
        const x = SLIDE.marginX + i * (w + gap);
        rect({ x, y: 2.15, w, h: 0.05, fill: c.accent });
        text({
          x,
          y: 2.28,
          w,
          h: 0.25,
          text: `0${i + 1}`,
          fontSize: t.kicker,
          bold: true,
          color: c.accent,
          lineSpacing: 1,
        });
        text({
          x,
          y: 2.6,
          w,
          h: 0.55,
          text: step.label || `Step ${i + 1}`,
          fontSize: fitFontSize(step.label || `Step ${i + 1}`, {
            w,
            h: 0.55,
            size: t.stepLabel,
            min: 11,
            lineSpacing: 1.1,
            bold: true,
          }),
          bold: true,
          color: c.ink,
          lineSpacing: 1.1,
        });
        if (step.detail) {
          text({
            x,
            y: 3.22,
            w,
            h: 1.85,
            text: step.detail,
            fontSize: fitFontSize(step.detail, {
              w,
              h: 1.85,
              size: t.stepDetail,
              min: 8.5,
              lineSpacing: 1.35,
            }),
            color: c.muted,
            lineSpacing: 1.35,
          });
        }
      });
    }
    return finish(elements, dark, slide.layout);
  }

  // bullets
  const bullets = slide.bullets.filter(Boolean);
  if (bullets.length) {
    text({
      x: SLIDE.marginX + 0.08,
      y: 2.0,
      w: SLIDE.contentWidth - 0.16,
      h: 4.35,
      paragraphs: bullets,
      bullet: true,
      fontSize: fitFontSize(bullets, {
        w: SLIDE.contentWidth - 0.45,
        h: 4.3,
        size: t.bullet,
        min: 10.5,
        lineSpacing: 1.45,
      }),
      color: c.ink,
      lineSpacing: 1.45,
    });
  }
  return finish(elements, dark, slide.layout);
}

/** Wrap the element list with canvas size + background into the final spec. */
function finish(elements, dark, layout) {
  return {
    layout,
    width: SLIDE.width,
    height: SLIDE.height,
    dark,
    background: dark ? THEME.colors.dark : THEME.colors.paper,
    elements,
  };
}
