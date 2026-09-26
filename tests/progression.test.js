/**
 * Commercial-progression event contract tests.
 *
 * progression.js decides, from an href alone, which of the estate's three
 * existing events a click is — and the whole point of the file is that the
 * RoboRacer funnel finally becomes measurable, so a silent misclassification
 * would be worse than no instrumentation at all. These tests pin the decisions
 * that matter commercially:
 *
 *   - the mailto: click is the terminal enquiry and must always be counted,
 *     footer included, because purchases are completed against a quotation
 *   - the quote CTA must be counted only in-content, never from the footer
 *     band that repeats on all eight pages
 *   - the orders.ambimat.com listings cross a GA4 property boundary, so they
 *     must be sent from here or they are invisible
 *   - no address, query string or link text is ever sent
 *
 * The DOM is stubbed by hand rather than with jsdom: the script touches five
 * anchor properties and one listener, which is cheaper to fake than to depend on.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = fs.readFileSync(path.join(REPO, "assets/js/progression.js"), "utf8");

const HOST = "roboracer.ambimat.com";

/** Minimal anchor stub: the five properties the script reads, plus closest(). */
function anchor(href, { inMain = true } = {}) {
  const el = { __href: href, __inMain: inMain };
  el.getAttribute = () => href;
  el.closest = (sel) => (sel === "a[href]" ? el : sel === "main#main" && inMain ? {} : null);
  if (/^(mailto|tel):/i.test(href)) {
    el.hostname = "";
    el.pathname = "";
    el.hash = "";
  } else {
    // Browsers resolve these against the document; do the same, crudely.
    const absolute = /^https?:/i.test(href) ? href : `https://${HOST}${href}`;
    const m = /^https?:\/\/([^/?#]+)([^?#]*)(?:\?[^#]*)?(#.*)?$/i.exec(absolute);
    el.hostname = m[1];
    el.pathname = m[2] || "/";
    el.hash = m[3] || "";
  }
  return el;
}

/** Load the script into a fresh context and return a click driver. */
function load(sourcePage = "/index.html") {
  const events = [];
  let handler = null;
  const sandbox = {
    window: {
      location: { pathname: sourcePage, hostname: HOST },
      gtag: (kind, name, params) => events.push({ kind, name, params }),
    },
    document: {
      addEventListener: (type, fn) => {
        if (type === "click") handler = fn;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  assert.ok(handler, "progression.js did not bind a click listener");
  return {
    events,
    click(href, opts) {
      const el = anchor(href, opts);
      handler({ target: el });
      return events[events.length - 1];
    },
  };
}

describe("progression.js — event classification", () => {
  test("binds once; a second evaluation is inert", () => {
    const events = [];
    const sandbox = {
      window: {
        location: { pathname: "/index.html", hostname: HOST },
        gtag: (k, n, p) => events.push({ k, n, p }),
      },
      document: { addEventListener: () => events.push({ bound: true }) },
    };
    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox);
    vm.runInContext(SOURCE, sandbox);
    assert.equal(events.filter((e) => e.bound).length, 1, "listener bound more than once");
  });

  test("the quote mailto is the terminal enquiry, and carries the kit", () => {
    const d = load("/use-cases.html");
    const e = d.click(
      "mailto:roboracer@ambimat.com?subject=RoboRacer%20Core%20Kit%20Pro%20quotation%20request",
    );
    assert.equal(e.name, "contact_method_click");
    assert.equal(e.params.contact_method, "email");
    assert.equal(e.params.quote_subject, "core_kit_pro");
    assert.equal(e.params.source_page, "/use-cases");
  });

  test("Core Kit and bare addresses are distinguished from Core Kit Pro", () => {
    const d = load();
    assert.equal(
      d.click("mailto:roboracer@ambimat.com?subject=RoboRacer%20Core%20Kit%20quotation%20request").params
        .quote_subject,
      "core_kit",
    );
    assert.equal(d.click("mailto:roboracer@ambimat.com").params.quote_subject, "general");
  });

  test("mailto and tel count from the footer too", () => {
    const d = load();
    assert.equal(d.click("mailto:support@ambimat.com", { inMain: false }).name, "contact_method_click");
    assert.equal(d.click("tel:+917925501989", { inMain: false }).params.contact_method, "phone");
  });

  test("no address, query string or subject text is ever sent", () => {
    const d = load();
    const e = d.click("mailto:roboracer@ambimat.com?subject=RoboRacer%20Core%20Kit%20quotation%20request");
    const serialised = JSON.stringify(e.params);
    assert.ok(!/@|ambimat\.com|subject=|quotation/i.test(serialised), `leaked PII/raw href: ${serialised}`);
  });

  test("the in-content quote CTA is product_contact_click, tagged by section", () => {
    const d = load("/use-cases.html");
    const e = d.click("/contact.html#order");
    assert.equal(e.name, "product_contact_click");
    assert.equal(e.params.contact_section, "order");
    assert.equal(e.params.source_page, "/use-cases");
    assert.equal(d.click("/contact.html#pricing").params.contact_section, "pricing");
    assert.equal(d.click("/contact.html").params.contact_section, "top");
  });

  test("the same CTA in the footer band is NOT counted", () => {
    const d = load("/use-cases.html");
    d.click("/contact.html#order", { inMain: false });
    assert.equal(d.events.length, 0, "footer CTA was counted as intent");
  });

  test("contact links on /contact itself are not counted", () => {
    const d = load("/contact.html");
    d.click("/contact.html#order");
    assert.equal(d.events.length, 0);
  });

  test("store listings cross a GA4 property boundary and are sent from here", () => {
    const d = load("/contact.html");
    const e = d.click("https://orders.ambimat.com/product/roboracer-core-kit/");
    assert.equal(e.name, "product_interest");
    assert.equal(e.params.product, "core_kit");
    assert.equal(e.params.source_page, "/contact");
    assert.deepEqual(Object.keys(e.params).sort(), ["product", "source_page"]);
    assert.equal(
      d.click("https://orders.ambimat.com/product/roboracer-core-kit-pro/").params.product,
      "core_kit_pro",
    );
  });

  test("store policy pages are not product interest", () => {
    const d = load("/contact.html");
    d.click("https://orders.ambimat.com/shipping-policy/");
    d.click("https://orders.ambimat.com/refund-and-cancellation-policy/");
    assert.equal(d.events.length, 0);
  });

  test("the platform guide and specification are product surfaces; a use case is not", () => {
    const d = load("/index.html");
    assert.equal(d.click("/autonomous-racing-robotics-kit.html").params.product, "core_kit_platform");
    assert.equal(d.click("/specifications.html").params.product, "core_kit_specifications");
    const before = d.events.length;
    d.click("/use-cases.html");
    d.click("/our-clients.html");
    assert.equal(d.events.length, before, "browsing was counted as product interest");
  });

  test("a self-link is not product interest", () => {
    const d = load("/specifications.html");
    d.click("/specifications.html");
    assert.equal(d.events.length, 0);
  });

  test("third-party links are ignored", () => {
    const d = load();
    d.click("https://github.com/f1tenth");
    assert.equal(d.events.length, 0);
  });

  test("inert when gtag never loaded", () => {
    const sandbox = {
      window: { location: { pathname: "/index.html", hostname: HOST } },
      document: { addEventListener: (t, fn) => (sandbox.__h = fn) },
    };
    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox);
    assert.doesNotThrow(() => sandbox.__h({ target: anchor("mailto:roboracer@ambimat.com") }));
  });
});

describe("progression.js — wiring", () => {
  test("every page that loads nav.js also loads progression.js", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      if (!html.includes("/assets/js/nav.js")) continue;
      assert.ok(html.includes("/assets/js/progression.js"), `${page} is not instrumented`);
    }
  });

  /* This guard used to assert `ids.size <= 1`. It was protecting against tag sprawl -
     a stray container picked up from a snippet - and that risk is real and unchanged.
     What changed on 2026-09-26 is that a SECOND id is now deliberate: the unified
     commercial property that orders.ambimat.com and ambimat.com already report to, added
     so the roboracer -> orders -> ambimat journey is one session in one property. So the
     guard is not removed, it is tightened: the approved pair, exactly, and nothing else.
     That catches a third id creeping in AND the unified id being dropped by accident,
     which the old form would have silently allowed. */
  const APPROVED_IDS = ["G-03T01GG8K1", "G-KCRP2C9ZCL"];

  test("instrumented pages declare exactly the approved measurement ids", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      const ids = [...new Set(html.match(/G-[A-Z0-9]{8,12}/g) || [])].sort();
      if (ids.length === 0) continue; // 404.html carries no analytics, by design
      assert.deepStrictEqual(ids, APPROVED_IDS, `${page} declares ${ids.join(", ")}`);
    }
  });

  test("every instrumented page loads the shared attribution module exactly once", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      if (!html.includes("G-03T01GG8K1")) continue;
      const hits = (html.match(/\/assets\/js\/ambi-attribution\.js/g) || []).length;
      assert.equal(hits, 1, `${page} loads the attribution module ${hits} times`);
    }
  });

  /* Two gtag.js <script> tags would mean two containers fetched and, depending on load
     order, a duplicated page_view inside a property. One loader, two config calls. */
  test("each page fetches the gtag loader exactly once", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      if (!html.includes("G-03T01GG8K1")) continue;
      const loaders = (html.match(/googletagmanager\.com\/gtag\/js/g) || []).length;
      assert.equal(loaders, 1, `${page} fetches the gtag loader ${loaders} times`);
    }
  });
});
