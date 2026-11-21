#!/usr/bin/env node
/**
 * AccessiKit EAA / RGAA v5 Auditor (v1.0.0)
 * Zero-dependency Node 20/22+ HTML/DOM accessibility pre-auditor checking 12 real
 * WCAG 2.1 AA / European Accessibility Act (Directive (EU) 2019/882) / French RGAA v5 criteria.
 *
 * Works natively as both a CLI and a GitHub Action (`runs: using: node20`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOL_NAME = "accessikit-eaa-rgaa";
export const TOOL_VERSION = "1.0.0";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "coverage",
  ".next",
  ".nuxt",
  "vendor",
  "venv",
  ".venv",
]);

export const CRITERIA_META = [
  { id: "html-lang", weight: 10, severity: "critical", ref: "WCAG 3.1.1 / RGAA 8.3", title: "Document language (<html lang>)" },
  { id: "document-title", weight: 8, severity: "critical", ref: "WCAG 2.4.2 / RGAA 8.5", title: "Non-empty page <title>" },
  { id: "img-alt", weight: 12, severity: "critical", ref: "WCAG 1.1.1 / RGAA 1.1", title: "Images have alt text" },
  { id: "heading-hierarchy", weight: 8, severity: "major", ref: "WCAG 1.3.1 / RGAA 9.1", title: "Valid heading hierarchy (h1–h6)" },
  { id: "form-labels", weight: 12, severity: "critical", ref: "WCAG 1.3.1 & 3.3.2 / RGAA 11.1", title: "Form fields have accessible labels" },
  { id: "empty-links-buttons", weight: 10, severity: "critical", ref: "WCAG 2.4.4 & 4.1.2 / RGAA 6.2", title: "Links & buttons have accessible names" },
  { id: "main-landmark", weight: 8, severity: "major", ref: "WCAG 1.3.1 & 2.4.1 / RGAA 9.2", title: "Presence of <main> landmark" },
  { id: "viewport-zoom", weight: 8, severity: "critical", ref: "WCAG 1.4.4 / RGAA 10.4", title: "Viewport does not lock user zoom" },
  { id: "iframe-title", weight: 6, severity: "major", ref: "WCAG 4.1.2 / RGAA 2.1", title: "Iframes carry a non-empty title" },
  { id: "duplicate-id", weight: 6, severity: "major", ref: "WCAG 4.1.1 / RGAA 8.2", title: "No duplicate element id attributes" },
  { id: "table-headers", weight: 6, severity: "major", ref: "WCAG 1.3.1 / RGAA 5.4 & 5.7", title: "Data tables include <th> or caption" },
  { id: "inline-color-contrast", weight: 6, severity: "major", ref: "WCAG 1.4.3 / RGAA 3.2", title: "Inline hex color contrast >= 4.5:1" },
];

/**
 * Parse a 3-digit or 6-digit hex color string into [r, g, b] (0..255).
 */
export function parseHexColor(hex) {
  if (!hex || typeof hex !== "string") return null;
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Compute WCAG 2.1 relative luminance & contrast ratio between two hex colors.
 */
export function contrastRatioHex(fgHex, bgHex) {
  const fg = parseHexColor(fgHex);
  const bg = parseHexColor(bgHex);
  if (!fg || !bg) return null;
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(fg);
  const l2 = lum(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function getAttr(tagAttrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tagAttrs.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim();
}

function hasAttr(tagAttrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|$)`, "i");
  return re.test(tagAttrs);
}

function stripNonDomBlocks(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "");
}

/**
 * Audit a single HTML document string against all 12 WCAG 2.1 AA / EAA / RGAA v5 rules.
 */
export function auditHtml(rawHtml, fileLabel = "inline.html") {
  const html = stripNonDomBlocks(String(rawHtml || ""));
  const issues = [];
  const failedRuleIds = new Set();

  const addIssue = (ruleId, message, sample = "") => {
    const meta = CRITERIA_META.find((c) => c.id === ruleId);
    failedRuleIds.add(ruleId);
    issues.push({
      ruleId,
      severity: meta ? meta.severity : "major",
      ref: meta ? meta.ref : "",
      message,
      sample: sample.slice(0, 140),
    });
  };

  // 1. html[lang]
  const htmlTag = html.match(/<html\b([^>]*)>/i);
  const langVal = htmlTag ? getAttr(htmlTag[1], "lang") : null;
  if (!langVal || langVal.length < 2) {
    addIssue("html-lang", "Missing or empty lang attribute on <html> (e.g. <html lang=\"fr\">).", htmlTag ? htmlTag[0] : "<html>");
  }

  // 2. <title>
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  if (!titleText) {
    addIssue("document-title", "Missing or empty <title> element in document <head>.");
  }

  // 3. <img> missing alt
  const imgRegex = /<img\b([^>]*)>/gi;
  let imgM;
  while ((imgM = imgRegex.exec(html)) !== null) {
    const attrs = imgM[1];
    const role = (getAttr(attrs, "role") || "").toLowerCase();
    const ariaHidden = (getAttr(attrs, "aria-hidden") || "").toLowerCase();
    if (role === "presentation" || role === "none" || ariaHidden === "true") continue;
    if (!hasAttr(attrs, "alt")) {
      addIssue("img-alt", "<img> element is missing an alt attribute (use alt=\"\" for decorative images).", imgM[0]);
    }
  }

  // 4. Heading hierarchy (h1-h6)
  const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const levels = [];
  let hM;
  while ((hM = headingRegex.exec(html)) !== null) {
    levels.push(Number.parseInt(hM[1], 10));
  }
  if (levels.length === 0) {
    addIssue("heading-hierarchy", "No heading elements (<h1>–<h6>) found in document.");
  } else {
    if (!levels.includes(1)) {
      addIssue("heading-hierarchy", "Document has headings but is missing a primary <h1>.");
    }
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) {
        addIssue(
          "heading-hierarchy",
          `Skipped heading level detected: <h${levels[i - 1]}> followed directly by <h${levels[i]}>.`
        );
        break;
      }
    }
  }

  // 5. Form <input>/<select>/<textarea> missing <label> / aria-label / aria-labelledby
  const labelForIds = new Set();
  const labelForRegex = /<label\b([^>]*)>/gi;
  let lM;
  while ((lM = labelForRegex.exec(html)) !== null) {
    const forId = getAttr(lM[1], "for");
    if (forId) labelForIds.add(forId);
  }
  // Collect wrapped label blocks
  const wrappedRanges = [];
  const wrappedLabelRegex = /<label\b[^>]*>[\s\S]*?<\/label>/gi;
  let wlM;
  while ((wlM = wrappedLabelRegex.exec(html)) !== null) {
    wrappedRanges.push([wlM.index, wlM.index + wlM[0].length]);
  }
  const isInsideLabel = (pos) => wrappedRanges.some(([s, e]) => pos >= s && pos <= e);

  const formFieldRegex = /<(input|select|textarea)\b([^>]*)>/gi;
  let fM;
  while ((fM = formFieldRegex.exec(html)) !== null) {
    const tag = fM[1].toLowerCase();
    const attrs = fM[2];
    if (tag === "input") {
      const type = (getAttr(attrs, "type") || "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
    }
    const id = getAttr(attrs, "id");
    const ariaLabel = getAttr(attrs, "aria-label");
    const ariaLabelledBy = getAttr(attrs, "aria-labelledby");
    const titleAttr = getAttr(attrs, "title");
    const ariaHidden = (getAttr(attrs, "aria-hidden") || "").toLowerCase();
    if (ariaHidden === "true") continue;
    const hasAccessibleLabel =
      Boolean(ariaLabel) ||
      Boolean(ariaLabelledBy) ||
      Boolean(titleAttr) ||
      (id && labelForIds.has(id)) ||
      isInsideLabel(fM.index);
    if (!hasAccessibleLabel) {
      addIssue(
        "form-labels",
        `<${tag}> is missing an associated <label for="...">, wrapping <label>, aria-label, or aria-labelledby.`,
        fM[0]
      );
    }
  }

  // 6. Empty links & buttons
  const interactiveRegex = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let iM;
  while ((iM = interactiveRegex.exec(html)) !== null) {
    const tag = iM[1].toLowerCase();
    const attrs = iM[2];
    const inner = iM[3];
    if (tag === "a" && !hasAttr(attrs, "href")) continue;
    const ariaHidden = (getAttr(attrs, "aria-hidden") || "").toLowerCase();
    if (ariaHidden === "true") continue;
    const visibleText = inner.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    const hasImgAlt = /<img\b[^>]*\balt\s*=\s*(?:"[^"]+"|'[^']+')/i.test(inner);
    const hasSvgTitle = /<title\b[^>]*>[^<]+<\/title>/i.test(inner);
    const ariaLabel = getAttr(attrs, "aria-label");
    const ariaLabelledBy = getAttr(attrs, "aria-labelledby");
    const titleAttr = getAttr(attrs, "title");
    if (!visibleText && !hasImgAlt && !hasSvgTitle && !ariaLabel && !ariaLabelledBy && !titleAttr) {
      addIssue("empty-links-buttons", `Empty <${tag}> element without visible text, img[alt], or aria-label.`, iM[0]);
    }
  }

  // 7. <main> landmark
  if (!/<main\b/i.test(html) && !/\brole\s*=\s*["']main["']/i.test(html)) {
    addIssue("main-landmark", "Document is missing a <main> landmark (or role=\"main\").");
  }

  // 8. Viewport zoom lock
  const metaRegex = /<meta\b([^>]*)>/gi;
  let mM;
  while ((mM = metaRegex.exec(html)) !== null) {
    const name = (getAttr(mM[1], "name") || "").toLowerCase();
    if (name !== "viewport") continue;
    const content = (getAttr(mM[1], "content") || "").toLowerCase();
    const maxScaleM = content.match(/maximum-scale\s*=\s*([0-9.]+)/);
    const locksScalable = /user-scalable\s*=\s*(no|0)\b/.test(content);
    const locksMaxScale = maxScaleM && Number.parseFloat(maxScaleM[1]) < 2;
    if (locksScalable || locksMaxScale) {
      addIssue(
        "viewport-zoom",
        "Viewport meta tag restricts pinch-to-zoom (user-scalable=no or maximum-scale < 2).",
        mM[0]
      );
    }
  }

  // 9. <iframe> missing title
  const iframeRegex = /<iframe\b([^>]*)>/gi;
  let ifM;
  while ((ifM = iframeRegex.exec(html)) !== null) {
    const ariaHidden = (getAttr(ifM[1], "aria-hidden") || "").toLowerCase();
    if (ariaHidden === "true") continue;
    const titleAttr = getAttr(ifM[1], "title");
    if (!titleAttr) {
      addIssue("iframe-title", "<iframe> is missing a descriptive title attribute.", ifM[0]);
    }
  }

  // 10. Duplicate id attributes
  const idCounts = new Map();
  const idRegex = /<[a-zA-Z][a-zA-Z0-9:-]*\b[^>]*?\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let idM;
  while ((idM = idRegex.exec(html)) !== null) {
    const idVal = (idM[1] ?? idM[2] ?? "").trim();
    if (!idVal) continue;
    idCounts.set(idVal, (idCounts.get(idVal) || 0) + 1);
  }
  for (const [idVal, count] of idCounts.entries()) {
    if (count > 1) {
      addIssue("duplicate-id", `Duplicate id="${idVal}" found ${count} times (breaks ARIA & label references).`);
    }
  }

  // 11. Data <table> missing <th> or <caption>
  const tableRegex = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let tM;
  while ((tM = tableRegex.exec(html)) !== null) {
    const attrs = tM[1];
    const body = tM[2];
    const role = (getAttr(attrs, "role") || "").toLowerCase();
    if (role === "presentation" || role === "none") continue;
    const hasTh = /<th\b/i.test(body);
    const hasCaption = /<caption\b[^>]*>[\s\S]*?<\/caption>/i.test(body) || Boolean(getAttr(attrs, "aria-label"));
    if (!hasTh && !hasCaption) {
      addIssue("table-headers", "Data <table> is missing header cells (<th>) and <caption>/aria-label.", `<table${attrs}>`);
    }
  }

  // 12. Inline hex color contrast ratio >= 4.5:1 (WCAG 2.1 AA)
  const styleRegex = /<[a-zA-Z][a-zA-Z0-9:-]*\b[^>]*?\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  let sM;
  while ((sM = styleRegex.exec(html)) !== null) {
    const styleStr = sM[1] ?? sM[2] ?? "";
    const fgM = styleStr.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,6})\b/i);
    const bgM = styleStr.match(/(?:^|;)\s*background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})\b/i);
    if (fgM && bgM) {
      const ratio = contrastRatioHex(fgM[1], bgM[1]);
      if (ratio !== null && ratio < 4.5) {
        addIssue(
          "inline-color-contrast",
          `Insufficient inline color contrast ${ratio}:1 (${fgM[1]} on ${bgM[1]} — WCAG AA requires >= 4.5:1).`,
          sM[0]
        );
      }
    }
  }

  // Score calculation across the 12 weighted criteria (sum of weights = 100)
  let score = 0;
  for (const c of CRITERIA_META) {
    if (!failedRuleIds.has(c.id)) {
      score += c.weight;
    }
  }
  const criticalFailed = CRITERIA_META.filter((c) => c.severity === "critical" && failedRuleIds.has(c.id)).length;
  const status =
    issues.length === 0
      ? "totalement conforme"
      : score >= 50 && criticalFailed < 3
        ? "partiellement conforme"
        : "non-conforme";

  return {
    file: fileLabel,
    score,
    status,
    criteriaPassed: CRITERIA_META.length - failedRuleIds.size,
    criteriaTotal: CRITERIA_META.length,
    criticalBlockers: criticalFailed,
    issuesCount: issues.length,
    issues,
  };
}

/**
 * Discover HTML files under targetPath (or return [targetPath] if file).
 */
export function discoverHtmlFiles(targetPath, maxDepth = 4) {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target path does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [resolved];

  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && /\.(?:html|htm)$/i.test(entry.name)) {
        found.push(path.join(dir, entry.name));
      }
    }
  };
  walk(resolved, 0);
  return found.sort();
}

export function renderMarkdownSummary(report) {
  const lines = [];
  lines.push("## AccessiKit — EAA & RGAA v5 Accessibility Audit");
  lines.push("");
  lines.push(`**Status:** \`${report.summary.rgaaStatus}\` | **Average Score:** **${report.summary.averageScore} / 100**`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push("| **Regulatory Scope** | EU EAA (Directive (EU) 2019/882, live `2025-06-28`) & French RGAA v5 / WCAG 2.1 AA |");
  lines.push(`| **HTML Files Audited** | ${report.summary.filesAudited} |`);
  lines.push(`| **Average Automated Score** | **${report.summary.averageScore} / 100** |`);
  lines.push(`| **Total Issues Detected** | ${report.summary.totalIssues} |`);
  lines.push(`| **EAA / RGAA Status (Automated Pre-Check)** | \`${report.summary.rgaaStatus}\` |`);
  lines.push("");

  if (report.files.length > 0) {
    lines.push("### Per-File Results");
    lines.push("");
    lines.push("| File | Score | Criteria Passed | Issues | Status |");
    lines.push("|---|---:|---:|---:|---|");
    for (const f of report.files) {
      lines.push(`| \`${f.file}\` | **${f.score}/100** | ${f.criteriaPassed}/${f.criteriaTotal} | ${f.issuesCount} | \`${f.status}\` |`);
    }
    lines.push("");
  }

  const allIssues = report.files.flatMap((f) => f.issues.map((i) => ({ ...i, file: f.file })));
  if (allIssues.length > 0) {
    lines.push("### Detected Violations");
    lines.push("");
    lines.push("| File | Rule | Ref | Severity | Message |");
    lines.push("|---|---|---|---|---|");
    for (const iss of allIssues.slice(0, 30)) {
      lines.push(`| \`${iss.file}\` | \`${iss.ruleId}\` | ${iss.ref} | ${iss.severity} | ${iss.message} |`);
    }
    lines.push("");
  }

  lines.push(
    "_Automated pre-audit covers ~30–40% of WCAG/RGAA criteria and complements a manual audit. Generated by [AccessiKit EAA/RGAA](https://yannabadie.github.io/accessikit-eaa-rgaa/) (MIT, zero dependencies)._"
  );
  return lines.join("\n");
}

function parseConfig(argv, env) {
  const cfg = {
    target: env.INPUT_TARGET || ".",
    reportOutput: env["INPUT_REPORT-OUTPUT"] || env.INPUT_REPORT_OUTPUT || "accessikit-report.json",
    minScore: Number.parseInt(env["INPUT_MIN-SCORE"] || env.INPUT_MIN_SCORE || "75", 10),
    failOnError: (env["INPUT_FAIL-ON-ERROR"] || env.INPUT_FAIL_ON_ERROR || "true").toLowerCase() !== "false",
    maxDepth: Number.parseInt(env["INPUT_MAX-DEPTH"] || env.INPUT_MAX_DEPTH || "4", 10) || 4,
    quiet: false,
  };
  if (Number.isNaN(cfg.minScore)) cfg.minScore = 75;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target" && argv[i + 1]) cfg.target = argv[++i];
    else if (arg === "--report" && argv[i + 1]) cfg.reportOutput = argv[++i];
    else if (arg === "--min-score" && argv[i + 1]) cfg.minScore = Number.parseInt(argv[++i], 10);
    else if (arg === "--no-fail") cfg.failOnError = false;
    else if (arg === "--quiet") cfg.quiet = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`AccessiKit EAA / RGAA v5 v${TOOL_VERSION} — Zero-dependency HTML Accessibility Auditor\n\nUsage:\n  node src/audit.mjs [target] [--report accessikit-report.json] [--min-score 75] [--no-fail]`);
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      cfg.target = arg;
    }
  }
  return cfg;
}

export function runAudit(cfg) {
  const rootDir = path.resolve(cfg.target);
  const files = discoverHtmlFiles(rootDir, cfg.maxDepth);
  const baseDir = fs.statSync(rootDir).isDirectory() ? rootDir : path.dirname(rootDir);

  const fileResults = files.map((fp) => {
    const html = fs.readFileSync(fp, "utf8");
    const rel = path.relative(baseDir, fp) || path.basename(fp);
    return auditHtml(html, rel);
  });

  const avgScore = fileResults.length
    ? Math.round(fileResults.reduce((acc, f) => acc + f.score, 0) / fileResults.length)
    : 100;
  const totalIssues = fileResults.reduce((acc, f) => acc + f.issuesCount, 0);
  const totalCritical = fileResults.reduce((acc, f) => acc + f.criticalBlockers, 0);
  const rgaaStatus =
    totalIssues === 0
      ? "totalement conforme"
      : avgScore >= 50 && totalCritical < 3
        ? "partiellement conforme"
        : "non-conforme";

  const reportPath = path.resolve(cfg.reportOutput);
  const report = {
    tool: `${TOOL_NAME}@${TOOL_VERSION}`,
    auditedAt: new Date().toISOString(),
    regulation: {
      eaa: "Directive (EU) 2019/882 (in force since 2025-06-28; DGCCRF fines up to EUR 7,500/violation cumulative)",
      rgaa: "French Law 2005-102 art. 47 & RGAA v5 (ARCOM fines up to EUR 50,000/service + EUR 25,000 missing declaration)",
    },
    summary: {
      filesAudited: fileResults.length,
      averageScore: avgScore,
      totalIssues,
      rgaaStatus,
      minScoreRequired: cfg.minScore,
    },
    files: fileResults,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  const markdown = renderMarkdownSummary(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n", "utf8");
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `report-path=${reportPath}`,
        `files-audited=${report.summary.filesAudited}`,
        `average-score=${report.summary.averageScore}`,
        `rgaa-status=${report.summary.rgaaStatus}`,
        `total-issues=${report.summary.totalIssues}`,
      ].join("\n") + "\n",
      "utf8"
    );
  }

  return { report, markdown };
}

const isMain =
  process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const cfg = parseConfig(process.argv.slice(2), process.env);
    const { report, markdown } = runAudit(cfg);
    if (!cfg.quiet) console.log(markdown);
    if (cfg.failOnError && report.summary.averageScore < cfg.minScore) {
      console.error(
        `\n[AccessiKit] FAIL: average score ${report.summary.averageScore}/100 is below min-score ${cfg.minScore}.`
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`[AccessiKit] ERROR: ${err.message}`);
    process.exit(2);
  }
}
