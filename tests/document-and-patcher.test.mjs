import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseDocumentFile, parseDocumentText } from "../src/kernel/document-model.mjs";
import { buildZipArchive } from "../src/kernel/ooxml-binary.mjs";
import {
  applyPatchesToOoxmlBuffer,
  applyPatchesToText,
  patchDocumentOnDisk,
} from "../src/kernel/patcher.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dislop-doc-test-"));
}

test("Markdown DocumentModel masks frontmatter & code blocks, keeps abbreviations/links intact, and indexes [P{i}-S{j}]", () => {
  const md = [
    "---",
    "title: Sample Post",
    "draft: [TODO]",
    "---",
    "",
    "# Release Notes",
    "",
    "Queue latency dropped from 14.5ms to 3.2ms (e.g. on Node v20.11). See [guide](https://example.com/a.b) for `cfg.timeout`.",
    "",
    "```js",
    "// [TODO] inside fenced code must be ignored",
    "const x = 1;",
    "```",
    "",
    "- First bullet sentence. Second sentence in bullet.",
  ].join("\n");

  const doc = parseDocumentText(md, "notes.md", "md");
  assert.equal(doc.format, "md");
  assert.equal(doc.language, "en");
  assert.equal(doc.artifacts.codeBlocks.length, 1);
  assert.equal(doc.artifacts.links.length, 1);
  assert.equal(doc.artifacts.links[0].url, "https://example.com/a.b");

  // Heading is P1-S1, body paragraph has 2 sentences (P2-S1, P2-S2), bullet has 2 sentences (P3-S1, P3-S2)
  assert.equal(doc.segments[0].id, "P1-S1");
  assert.equal(doc.segments[0].text, "Release Notes");
  assert.equal(doc.segments[1].id, "P2-S1");
  assert.match(doc.segments[1].text, /14\.5ms to 3\.2ms \(e\.g\. on Node v20\.11\)\./);
  assert.equal(doc.segments[2].id, "P2-S2");
  assert.equal(doc.segments[3].id, "P3-S1");
  assert.equal(doc.segments[4].id, "P3-S2");
});

test("patcher.mjs deletes filler sentences cleanly without double spaces or triple blank lines and preserves CRLF", () => {
  const src = [
    "First paragraph stays intact.",
    "",
    "In today's fast-paced world, change is constant.",
    "",
    "Keep the opening claim. Delete this middle filler. Keep the final metric of 42ms.",
  ].join("\r\n");

  const doc = parseDocumentText(src, "crlf.md", "md");
  const patched = applyPatchesToText(src, doc, [
    { targetId: "P2-S1", replacement: "" },
    { targetId: "P3-S2", replacement: "" },
  ]);

  assert.ok(patched.includes("\r\n"), "CRLF line endings should be preserved");
  assert.ok(!patched.includes("\r\n\r\n\r\n"), "Should collapse triple blank lines after full paragraph deletion");
  assert.ok(
    patched.includes("Keep the opening claim. Keep the final metric of 42ms."),
    `Unexpected spacing in: ${JSON.stringify(patched)}`,
  );
});

test("DOCX & PPTX OOXML parsing and lossless ZIP round-trip patching preserve formatting and binary entries", () => {
  const tmpDir = makeTempDir();
  try {
    const fakeMediaBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const docxPath = path.join(tmpDir, "sample.docx");
    const docxBuf = buildZipArchive({
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
      "word/document.xml": [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`,
        `<w:body>`,
        `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Certainly! Here is the draft. </w:t></w:r><w:r><w:t> Export finished in 12 minutes with **raw bold**.</w:t></w:r></w:p>`,
        `</w:body></w:document>`,
      ].join(""),
      "word/media/image1.png": fakeMediaBytes,
    });
    fs.writeFileSync(docxPath, docxBuf);

    const doc = parseDocumentFile(docxPath);
    assert.equal(doc.format, "docx");
    assert.equal(doc.segments.length, 2);
    assert.equal(doc.segments[0].id, "B1-S1");
    assert.equal(doc.segments[0].text, "Certainly! Here is the draft.");
    assert.equal(doc.artifacts.rawFormattingLeaks.length, 1);
    assert.equal(doc.artifacts.rawFormattingLeaks[0].pattern, "bold-asterisks");

    // Delete B1-S1 and unwrap **raw bold** in B1-S2
    const patchedBuf = applyPatchesToOoxmlBuffer(docxBuf, doc, [
      { targetId: "B1-S1", replacement: "" },
      { targetId: "B1-S2", replacement: "Export finished in 12 minutes with raw bold." },
    ]);
    fs.writeFileSync(docxPath, patchedBuf);

    const reparsed = parseDocumentFile(docxPath);
    assert.equal(reparsed.segments.length, 1);
    assert.equal(reparsed.segments[0].text, "Export finished in 12 minutes with raw bold.");
    assert.equal(reparsed.artifacts.rawFormattingLeaks.length, 0);

    // PPTX slide signals test
    const pptxPath = path.join(tmpDir, "deck.pptx");
    const pptxBuf = buildZipArchive({
      "ppt/slides/slide1.xml": [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`,
        `<p:txBody><a:bodyPr><a:normAutofit fontScale="65000"/></a:bodyPr>`,
        `<a:p><a:r><a:t>Quarterly Latency Summary</a:t></a:r></a:p>`,
        `</p:txBody></p:sld>`,
      ].join(""),
    });
    fs.writeFileSync(pptxPath, pptxBuf);

    const pptxDoc = parseDocumentFile(pptxPath);
    assert.equal(pptxDoc.format, "pptx");
    assert.equal(pptxDoc.artifacts.deckSignals.slideCount, 1);
    assert.equal(pptxDoc.artifacts.deckSignals.slides[0].autofitFontScale, 65);

    // Atomic write with --backup
    const mdFile = path.join(tmpDir, "atomic.md");
    fs.writeFileSync(mdFile, "Certainly! Here is the note.\n\nActual release content.\n", "utf8");
    const mdDoc = parseDocumentFile(mdFile);
    const patchRes = patchDocumentOnDisk(
      mdDoc,
      [{ targetId: "P1-S1", replacement: "" }],
      { backup: true },
    );
    assert.equal(patchRes.modified, true);
    assert.ok(fs.existsSync(`${mdFile}.bak`));
    assert.equal(fs.readFileSync(mdFile, "utf8").trim(), "Actual release content.");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
