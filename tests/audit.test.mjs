import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  auditHtml,
  contrastRatioHex,
  discoverHtmlFiles,
  parseHexColor,
  renderMarkdownSummary,
  runAudit,
} from "../src/audit.mjs";

const COMPLIANT_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boutique Conforme EAA &amp; RGAA</title>
</head>
<body>
  <header><a href="/">Accueil</a></header>
  <main>
    <h1>Catalogue produits</h1>
    <h2>Fiche produit</h2>
    <img src="shoe.jpg" alt="Chaussure de course bleue">
    <img src="decor.svg" alt="">
    <form>
      <label for="email">Votre email professionnel</label>
      <input id="email" type="email" name="email">
      <button type="submit">Envoyer</button>
    </form>
    <table>
      <caption>Tarifs TTC</caption>
      <thead><tr><th>Offre</th><th>Prix</th></tr></thead>
      <tbody><tr><td>Pack</td><td>49 €</td></tr></tbody>
    </table>
    <iframe src="https://example.com/map" title="Carte de localisation"></iframe>
    <p style="color:#0F172A;background-color:#FFFFFF;">Contraste AAA conforme.</p>
  </main>
</body>
</html>`;

test("parseHexColor & contrastRatioHex compute exact WCAG 2.1 contrast ratios", () => {
  assert.deepEqual(parseHexColor("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHexColor("#0F172A"), [15, 23, 42]);
  assert.equal(parseHexColor("not-a-color"), null);
  assert.equal(contrastRatioHex("#000000", "#FFFFFF"), 21);
  assert.ok(contrastRatioHex("#0F172A", "#FFFFFF") > 15);
  assert.ok(contrastRatioHex("#999999", "#FFFFFF") < 4.5);
});

test("auditHtml gives 100/100 totalement conforme for compliant HTML fixture", () => {
  const res = auditHtml(COMPLIANT_HTML, "compliant.html");
  assert.equal(res.score, 100);
  assert.equal(res.status, "totalement conforme");
  assert.equal(res.issuesCount, 0);
  assert.equal(res.criteriaPassed, 12);
});

test("auditHtml catches missing html[lang], <title>, and <main> landmark", () => {
  const html = "<html><head></head><body><h1>Bonjour</h1></body></html>";
  const res = auditHtml(html, "minimal.html");
  const ids = new Set(res.issues.map((i) => i.ruleId));
  assert.ok(ids.has("html-lang"));
  assert.ok(ids.has("document-title"));
  assert.ok(ids.has("main-landmark"));
  assert.ok(res.score < 80);
});

test("auditHtml catches missing img[alt] while allowing decorative alt='' and role='presentation'", () => {
  const html = `<html lang="fr"><head><title>T</title></head><body><main>
    <h1>Imgs</h1>
    <img src="a.jpg">
    <img src="b.jpg" alt="">
    <img src="c.jpg" role="presentation">
  </main></body></html>`;
  const res = auditHtml(html);
  assert.equal(res.issues.filter((i) => i.ruleId === "img-alt").length, 1);
});

test("auditHtml catches skipped heading levels and missing h1", () => {
  const html = `<html lang="fr"><head><title>T</title></head><body><main>
    <h1>Titre</h1><h3>Saut de niveau</h3>
  </main></body></html>`;
  const res = auditHtml(html);
  assert.ok(res.issues.some((i) => i.ruleId === "heading-hierarchy"));
});

test("auditHtml catches unlabeled inputs and empty links/buttons", () => {
  const html = `<html lang="fr"><head><title>T</title></head><body><main>
    <h1>Form</h1>
    <input type="text" name="q">
    <input type="hidden" name="csrf" value="abc">
    <a href="/cart"></a>
    <button type="button"><span></span></button>
    <button type="button" aria-label="Fermer">×</button>
  </main></body></html>`;
  const res = auditHtml(html);
  assert.equal(res.issues.filter((i) => i.ruleId === "form-labels").length, 1);
  assert.equal(res.issues.filter((i) => i.ruleId === "empty-links-buttons").length, 2);
});

test("auditHtml catches viewport zoom lock, iframe missing title, duplicate id, table missing th, and low inline contrast", () => {
  const html = `<html lang="fr"><head>
    <title>Broken</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  </head><body><main>
    <h1 id="dup">Broken page</h1>
    <p id="dup" style="color:#CCCCCC;background-color:#FFFFFF;">Low contrast</p>
    <iframe src="https://example.com"></iframe>
    <table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>
  </main></body></html>`;
  const res = auditHtml(html);
  const ids = new Set(res.issues.map((i) => i.ruleId));
  assert.ok(ids.has("viewport-zoom"));
  assert.ok(ids.has("iframe-title"));
  assert.ok(ids.has("duplicate-id"));
  assert.ok(ids.has("table-headers"));
  assert.ok(ids.has("inline-color-contrast"));
  assert.equal(res.status, "partiellement conforme");
});

test("auditHtml returns non-conforme when >= 3 critical blockers fail", () => {
  const broken = `<html><head><meta name="viewport" content="maximum-scale=1"></head>
  <body><img src="x.png"><input type="text"><a href="/x"></a></body></html>`;
  const res = auditHtml(broken);
  assert.equal(res.status, "non-conforme");
  assert.ok(res.criticalBlockers >= 3);
  assert.ok(res.score < 50);
});

test("runAudit scans directory end-to-end, writes JSON report and renders Markdown summary", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "accessikit-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "index.html"), COMPLIANT_HTML, "utf8");
    const outPath = path.join(tmpDir, "report.json");
    const discovered = discoverHtmlFiles(tmpDir);
    assert.equal(discovered.length, 1);

    const { report, markdown } = runAudit({
      target: tmpDir,
      reportOutput: outPath,
      minScore: 90,
      failOnError: true,
      maxDepth: 2,
      quiet: true,
    });
    assert.equal(report.summary.averageScore, 100);
    assert.equal(report.summary.rgaaStatus, "totalement conforme");
    assert.ok(fs.existsSync(outPath));
    assert.ok(markdown.includes("AccessiKit — EAA & RGAA v5 Accessibility Audit"));
    assert.ok(renderMarkdownSummary(report).includes("totalement conforme"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
