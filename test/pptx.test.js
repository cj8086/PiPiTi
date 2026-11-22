import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { mockDeck } from "../bundle/core/mock.js";
import { PPTX_MIME, buildPptx } from "../bundle/core/render-pptx.js";

test("mock deck exports a real, editable PPTX", async () => {
  const deck = mockDeck();
  const pptx = buildPptx(deck, PptxGenJS);
  const buffer = await pptx.write({ outputType: "nodebuffer" });

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 20000, `PPTX is only ${buffer.length} bytes`);
  assert.equal(buffer.subarray(0, 2).toString("latin1"), "PK");
  assert.equal(
    PPTX_MIME,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipiti-test-"));
  const file = path.join(dir, "deck.pptx");
  fs.writeFileSync(file, buffer);
  try {
    const listing = execFileSync("unzip", ["-l", file], { encoding: "utf8" });
    const slides = listing
      .split("\n")
      .filter((line) => /ppt\/slides\/slide\d+\.xml$/.test(line.trim()));
    assert.equal(slides.length, deck.slides.length);

    const xml = execFileSync("unzip", ["-p", file, "ppt/slides/slide2.xml"], {
      encoding: "utf8",
    });
    assert.ok(xml.includes("<a:t>"), "slide text is not real OOXML text");
    assert.ok(xml.includes("small teams win"), "bullet slide text is missing");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
