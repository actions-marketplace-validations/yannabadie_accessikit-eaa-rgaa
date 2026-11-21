# AccessiKit — EU EAA & French RGAA v5 Accessibility Auditor

[![CI](https://github.com/yannabadie/accessikit-eaa-rgaa/actions/workflows/ci.yml/badge.svg)](https://github.com/yannabadie/accessikit-eaa-rgaa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![EU EAA LIVE](https://img.shields.io/badge/EU%20EAA-In%20Force%20since%202025--06--28-047857)](https://yannabadie.github.io/accessikit-eaa-rgaa/)

**Zero-dependency** GitHub Action, Node 20/22+ CLI, and **100 % browser-side HTML Accessibility Auditor + Official RGAA v5 / EAA Accessibility Declaration Generator**.

- **Free Web Auditor & RGAA/EAA Declaration Generator (EN/FR):** https://yannabadie.github.io/accessikit-eaa-rgaa/
- **Zero external npm dependencies** (`dependencies: {}`) — runs in milliseconds in any CI pipeline.

---

## Regulatory Context (November 2026)

- **European Accessibility Act (EAA — Directive (EU) 2019/882, transposed via French Law n° 2023-171):** **IN FORCE since 28 June 2025** for private B2C e-commerce, banking, transport, telecoms, ticketing, and e-books above the cumulative micro-enterprise exemption (`< 10` employees AND `<= €2M` turnover/balance sheet). Active **DGCCRF** enforcement in 2026: up to **€7,500 per violation** (cumulative) + injunctions/penalties.
- **French RGAA (Law 2005-102 art. 47 & RGAA v5):** Enforced by **ARCOM** on public sector & private firms `> €250M` turnover (**up to €50,000** per non-compliant service renewable every 6 months + **€25,000** for missing declaration/multi-year plan). **RGAA v5** (WCAG 2.2, mobile/docs, blocking criteria, national ARCOM teleservice) scheduled for Dec 2026 / decree 2027.

> _Honest Scope Note: Automated HTML analysis catches ~30–40% of WCAG/RGAA defects (structural blockers) in CI before release and prepares — without replacing — a full manual accessibility audit._

---

## 12 Automated WCAG 2.1 AA / EAA / RGAA v5 Checks

| # | Rule ID | Reference | What it checks |
|---:|---|---|---|
| 1 | `html-lang` | WCAG 3.1.1 / RGAA 8.3 | `<html lang="...">` present & valid |
| 2 | `document-title` | WCAG 2.4.2 / RGAA 8.5 | Non-empty `<title>` |
| 3 | `img-alt` | WCAG 1.1.1 / RGAA 1.1 | Every non-decorative `<img>` carries `alt` |
| 4 | `heading-hierarchy` | WCAG 1.3.1 / RGAA 9.1 | Primary `<h1>` & no skipped heading levels (`h1 -> h3`) |
| 5 | `form-labels` | WCAG 1.3.1 & 3.3.2 / RGAA 11.1 | Inputs/selects/textareas have `<label>` or `aria-label` |
| 6 | `empty-links-buttons` | WCAG 2.4.4 & 4.1.2 / RGAA 6.2 | No empty `<a>` or `<button>` without accessible name |
| 7 | `main-landmark` | WCAG 1.3.1 & 2.4.1 / RGAA 9.2 | `<main>` or `role="main"` landmark present |
| 8 | `viewport-zoom` | WCAG 1.4.4 / RGAA 10.4 | Viewport does not lock zoom (`user-scalable=no` / `max-scale < 2`) |
| 9 | `iframe-title` | WCAG 4.1.2 / RGAA 2.1 | Every `<iframe>` includes a `title` |
| 10 | `duplicate-id` | WCAG 4.1.1 / RGAA 8.2 | No duplicate `id` attributes |
| 11 | `table-headers` | WCAG 1.3.1 / RGAA 5.4 & 5.7 | Data tables include `<th>` or `<caption>` |
| 12 | `inline-color-contrast` | WCAG 1.4.3 / RGAA 3.2 | Inline hex color pairs meet WCAG AA `>= 4.5:1` contrast |

---

## Quick Start — GitHub Actions (5 Lines)

```yaml
- uses: actions/checkout@v4
- uses: yannabadie/accessikit-eaa-rgaa@v1.0.0
  with:
    target: "dist"
    report-output: "accessikit-report.json"
    min-score: "80"
    fail-on-error: "true"
```

---

## Companion EU RegTech Tools

- **CRA-SBOM-Guard (EU Cyber Resilience Act Art. 14):** https://yannabadie.github.io/cra-sbom-guard/
- **FacturKit 2027 (Factur-X 1.09.2 & 159 PA Comparator):** https://yannabadie.github.io/facturkit-2027/

## License

MIT — see [LICENSE](LICENSE).
