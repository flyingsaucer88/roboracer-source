/**
 * Responsive + console smoke check.
 *
 * Loads every page of the built artifact at each target breakpoint and
 * reports: horizontal overflow, which element causes it, console errors,
 * failed network requests, and touch targets below 24x24 CSS px.
 *
 * Usage:
 *   node tools/check-responsive.mjs [baseUrl]
 *
 * Requires a Chrome/Chromium binary. Set CHROME_PATH to override detection.
 * This is a local/manual diagnostic — CI enforces accessibility and layout
 * through Lighthouse, which needs no extra browser dependency.
 */

import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:8099";
const PAGES = [
  "/index.html",
  "/autonomous-racing-robotics-kit.html",
  "/specifications.html",
  "/getting-started.html",
  "/use-cases.html",
  "/contact.html",
  "/resource.html",
  "/404.html",
];
const WIDTHS = [320, 375, 768, 1024, 1440];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No Chrome binary found. Set CHROME_PATH.");
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars"],
});

let failures = 0;

for (const path of PAGES) {
  console.log(`\n\x1b[1m${path}\x1b[0m`);

  for (const width of WIDTHS) {
    const page = await browser.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    page.on("requestfailed", (req) => {
      // Analytics is blocked offline; that is expected and not a site defect.
      if (!/googletagmanager|google-analytics|analytics\.google\.com/.test(req.url())) {
        failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
      }
    });

    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 30000 });

    const report = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewport = window.innerWidth;

      // Which elements actually stick out past the viewport?
      const offenders = [];
      if (docWidth > viewport + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.right > viewport + 1 || r.left < -1) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className || "").toString().slice(0, 48),
              right: Math.round(r.right),
              left: Math.round(r.left),
            });
          }
        }
      }

      // Interactive targets smaller than the WCAG 2.2 AA minimum (24x24).
      const smallTargets = [];
      for (const el of document.querySelectorAll("a, button, input, select, textarea")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.width < 24 || r.height < 24) {
          smallTargets.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || "").trim().slice(0, 28),
            size: `${Math.round(r.width)}x${Math.round(r.height)}`,
          });
        }
      }

      return {
        docWidth,
        viewport,
        offenders: offenders.slice(0, 6),
        smallTargets: smallTargets.slice(0, 6),
      };
    });

    const overflow = report.docWidth > report.viewport + 1;
    const problems = [];
    if (overflow) problems.push(`overflow ${report.docWidth}px > ${report.viewport}px`);
    if (consoleErrors.length) problems.push(`${consoleErrors.length} console error(s)`);
    if (failedRequests.length) problems.push(`${failedRequests.length} failed request(s)`);
    if (report.smallTargets.length) problems.push(`${report.smallTargets.length} small target(s)`);

    if (problems.length === 0) {
      console.log(`  \x1b[32mPASS\x1b[0m  ${String(width).padStart(4)}px`);
    } else {
      failures += 1;
      console.log(`  \x1b[31mFAIL\x1b[0m  ${String(width).padStart(4)}px  ${problems.join("; ")}`);
      for (const o of report.offenders) {
        console.log(`          overflows: <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right}`);
      }
      for (const t of report.smallTargets) {
        console.log(`          small target: <${t.tag}> "${t.text}" ${t.size}`);
      }
      for (const e of consoleErrors.slice(0, 3)) console.log(`          console: ${e.slice(0, 140)}`);
      for (const r of failedRequests.slice(0, 3)) console.log(`          request: ${r.slice(0, 140)}`);
    }

    await page.close();
  }
}

await browser.close();
console.log(
  failures === 0
    ? "\n\x1b[32mAll breakpoints clean.\x1b[0m"
    : `\n\x1b[31m${failures} breakpoint check(s) failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
