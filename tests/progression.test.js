/**
 * Commercial-progression event contract tests.
 *
 * progression.js decides, from an href alone, what commercial CTA a click is and
 * emits ONE reusable event, `cta_click`, with stable machine-readable parameters.
 * A silent misclassification would be worse than no instrumentation, so these
 * tests pin the decisions that matter commercially:
 *
 *   - the quote mailto is commercial INTENT and must always be counted, footer
 *     included, because purchases are completed against a quotation — but it is
 *     never a lead, and `generate_lead` must never be emitted from here
 *   - the in-content quote CTA is counted only in-content, never from the footer
 *     band that repeats on all eight pages
 *   - the PCB category is a real commercial route and must be counted
 *   - product identifiers are the Central Intake enums, so an analytics row and
 *     an inquiry row name the same thing
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

  /* The single most important assertion in this file. Opening a mail client is not
     evidence that anything was sent, received or read. If this ever starts emitting
     generate_lead, reported lead volume becomes fiction. */
  test("a mailto is commercial intent and is NEVER a lead", () => {
    const rr = load();
    const ev = rr.click("mailto:roboracer@ambimat.com?subject=RoboRacer%20Core%20Kit%20quotation");
    assert.equal(ev.name, "cta_click");
    assert.equal(ev.params.intent, "quote");
    assert.equal(ev.params.destination_type, "mailto");
    assert.equal(ev.params.cta_id, "quote_email");
    assert.ok(
      !rr.events.some((e) => e.name === "generate_lead"),
      "generate_lead must never be emitted from a CTA click",
    );
  });

  test("the quote mailto carries the Central Intake product enum", () => {
    const rr = load();
    assert.equal(
      rr.click("mailto:roboracer@ambimat.com?subject=RoboRacer%20Core%20Kit%20Pro%20quotation").params
        .product,
      "CORE_KIT_PRO",
    );
    assert.equal(
      rr.click("mailto:roboracer@ambimat.com?subject=RoboRacer%20Core%20Kit%20quotation").params.product,
      "CORE_KIT",
    );
    // A bare address names no kit, and must not guess one.
    assert.equal(rr.click("mailto:roboracer@ambimat.com").params.product, "UNDECIDED");
  });

  test("each desk maps to its own intent", () => {
    const rr = load();
    assert.equal(rr.click("mailto:support@ambimat.com").params.intent, "support");
    assert.equal(rr.click("mailto:support@ambimat.com").params.cta_id, "support_email");
    assert.equal(rr.click("mailto:business.development@ambimat.com").params.intent, "partnership");
    // An unknown address is still counted, but never mislabelled as a quote.
    const other = rr.click("mailto:someone@example.com");
    assert.equal(other.params.cta_id, "other_email");
    assert.equal(other.params.intent, "contact");
    assert.equal(other.params.product, undefined);
  });

  test("mailto and tel count from the footer too", () => {
    const rr = load();
    assert.equal(rr.click("mailto:roboracer@ambimat.com", { inMain: false }).name, "cta_click");
    const tel = rr.click("tel:+912240161000", { inMain: false });
    assert.equal(tel.params.destination_type, "tel");
    assert.equal(tel.params.cta_id, "phone");
  });

  test("no address, query string or subject text is ever sent", () => {
    const rr = load();
    rr.click("mailto:roboracer@ambimat.com?subject=RoboRacer%20Core%20Kit%20quotation");
    rr.click("mailto:support@ambimat.com");
    rr.click("tel:+912240161000");
    const serialised = JSON.stringify(rr.events);
    assert.ok(!/@|ambimat\.com|subject=|quotation/i.test(serialised), `leaked PII/raw href: ${serialised}`);
  });

  test("every event carries the source site and page", () => {
    const rr = load("/specifications.html");
    const ev = rr.click("mailto:roboracer@ambimat.com");
    assert.equal(ev.params.source_site, "roboracer");
    assert.equal(ev.params.source_page, "/specifications");
  });

  test("the in-content quote CTA is tagged by section", () => {
    const rr = load("/index.html");
    const ev = rr.click("/contact.html#order");
    assert.equal(ev.name, "cta_click");
    assert.equal(ev.params.intent, "quote");
    assert.equal(ev.params.cta_id, "contact_page_order");
    assert.equal(ev.params.destination_type, "internal");
  });

  test("the same CTA in the footer band is NOT counted", () => {
    const rr = load("/index.html");
    const before = rr.events.length;
    rr.click("/contact.html#order", { inMain: false });
    assert.equal(rr.events.length, before, "footer CTA was counted");
  });

  test("contact links on /contact itself are not counted", () => {
    const rr = load("/contact.html");
    const before = rr.events.length;
    rr.click("/contact.html#order");
    assert.equal(rr.events.length, before);
  });

  test("store product listings are counted with the right product", () => {
    const rr = load("/contact.html");
    const kit = rr.click("https://orders.ambimat.com/product/roboracer-core-kit/");
    assert.equal(kit.name, "cta_click");
    assert.equal(kit.params.product, "CORE_KIT");
    assert.equal(kit.params.cta_id, "store_core_kit");
    assert.equal(kit.params.intent, "purchase_intent");
    assert.equal(kit.params.destination_type, "store");
    assert.equal(
      rr.click("https://orders.ambimat.com/product/roboracer-core-kit-pro/").params.product,
      "CORE_KIT_PRO",
    );
  });

  /* The gap this pass closed: the PCB category is a genuine commercial route and
     used to emit nothing, so a visitor going to the power-board catalogue looked
     identical to one who bounced. */
  test("the PCB category is a counted commercial route", () => {
    const rr = load("/resource.html");
    const ev = rr.click("https://orders.ambimat.com/product-category/pcb-board/");
    assert.equal(ev.name, "cta_click");
    assert.equal(ev.params.cta_id, "store_pcb_category");
    assert.equal(ev.params.product, "POWER_BOARD");
    assert.equal(ev.params.intent, "purchase_intent");
  });

  test("store policy pages are not commercial intent", () => {
    const rr = load("/index.html");
    const before = rr.events.length;
    rr.click("https://orders.ambimat.com/shipping-policy/");
    rr.click("https://orders.ambimat.com/refund-and-cancellation-policy/");
    rr.click("https://orders.ambimat.com/");
    assert.equal(rr.events.length, before, "a policy or store-root link was counted");
  });

  test("the platform guide and specification are product surfaces; a use case is not", () => {
    const rr = load("/index.html");
    const guide = rr.click("/autonomous-racing-robotics-kit.html");
    assert.equal(guide.params.cta_id, "product_detail");
    assert.equal(guide.params.product, "CORE_KIT");
    assert.equal(guide.params.intent, "research");
    const before = rr.events.length;
    rr.click("/use-cases.html");
    assert.equal(rr.events.length, before, "a use case was counted as a product surface");
  });

  test("a self-link is not counted", () => {
    const rr = load("/specifications.html");
    const before = rr.events.length;
    rr.click("/specifications.html");
    assert.equal(rr.events.length, before);
  });

  test("third-party links are ignored", () => {
    const rr = load("/index.html");
    const before = rr.events.length;
    rr.click("https://github.com/ambimat");
    rr.click("https://traxxas.com/");
    assert.equal(rr.events.length, before);
  });

  test("campaign attribution is attached when the shared module is present", () => {
    const events = [];
    const sandbox = {
      window: {
        location: { pathname: "/index.html", hostname: HOST },
        gtag: (kind, name, params) => events.push({ kind, name, params }),
        ambimatAttribution: {
          eventParams: () => ({ attr_campaign: "roboracer_x_2026_10", attr_source: "benchmarkemail" }),
        },
      },
      document: { addEventListener: (t, fn) => (sandbox.__h = fn) },
    };
    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox);
    sandbox.__h({ target: anchor("mailto:roboracer@ambimat.com") });
    assert.equal(events[0].params.attr_campaign, "roboracer_x_2026_10");
    assert.equal(events[0].params.attr_source, "benchmarkemail");
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

  /* This guard used to assert `ids.size <= 1`, protecting against tag sprawl - a stray
     container picked up from a snippet. That risk is real and unchanged, so the guard
     stays; it is just pinned to the one id that is correct.

     On 2026-09-26 this host moved OFF its own property (546867357, G-KCRP2C9ZCL) and onto
     the unified commercial property that orders.ambimat.com and ambimat.com already use,
     so the roboracer -> orders -> ambimat journey is one session in one property. The old
     property is retained and still queryable; it just stops collecting.

     Dual-tagging was tried first and rejected on measurement, not taste: a second
     configured destination made gtag.js pull an extra container and took script weight to
     364,888 B against the 200,000 B error-level budget in .lighthouserc.json. So the
     legacy id must NOT come back, and that is asserted explicitly rather than left to the
     generic count - a silent re-add would break a performance gate, not just a convention. */
  const UNIFIED_ID = "G-03T01GG8K1";
  const RETIRED_ID = "G-KCRP2C9ZCL";

  test("instrumented pages declare only the unified measurement id", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      const ids = [...new Set(html.match(/G-[A-Z0-9]{8,12}/g) || [])];
      if (ids.length === 0) continue; // 404.html carries no analytics, by design
      assert.deepStrictEqual(ids, [UNIFIED_ID], `${page} declares ${ids.join(", ")}`);
    }
  });

  test("the retired property id is not reintroduced anywhere", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      assert.ok(!html.includes(RETIRED_ID), `${page} reintroduces the retired property id`);
    }
  });

  test("every instrumented page loads the shared attribution module exactly once", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      if (!html.includes(UNIFIED_ID)) continue;
      const hits = (html.match(/\/assets\/js\/ambi-attribution\.js/g) || []).length;
      assert.equal(hits, 1, `${page} loads the attribution module ${hits} times`);
    }
  });

  /* Two gtag.js <script> tags would mean two containers fetched and, depending on load
     order, a duplicated page_view inside the property. Exactly one loader, one config. */
  test("each page fetches the gtag loader exactly once", () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const html = fs.readFileSync(path.join(REPO, page), "utf8");
      if (!html.includes(UNIFIED_ID)) continue;
      const loaders = (html.match(/googletagmanager\.com\/gtag\/js/g) || []).length;
      assert.equal(loaders, 1, `${page} fetches the gtag loader ${loaders} times`);
    }
  });
});
