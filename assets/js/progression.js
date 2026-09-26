/* RoboRacer — commercial CTA instrumentation.
 *
 * ONE reusable event, `cta_click`, with stable machine-readable parameters.
 * Visible CTA wording can be rewritten at any time without breaking a report,
 * because nothing here is derived from link text.
 *
 * WHY ONE EVENT AND NOT THREE
 *
 * This replaces product_interest / product_contact_click / contact_method_click,
 * which were added on 2026-09-22 and reported to RoboRacer's own GA4 property.
 * That property stopped collecting at the 2026-09-26 cutover, and in the unified
 * property those three names have NO history at all — so there is nothing to
 * preserve and this is the one moment the taxonomy can be tidied for free.
 * A single event also keeps every future CTA out of GA4's 500-event-name cap.
 *
 * WHAT THIS IS NOT
 *
 * `cta_click` is COMMERCIAL INTENT, never a lead. A mailto click proves the mail
 * client opened, not that anything was sent or received. `generate_lead` stays
 * bound to a genuine successful submission and is emitted elsewhere, never here.
 *
 * PRODUCT IDENTIFIERS come from the Central Intake contract
 * (central-intake/contracts/schemas/intake/roboracer-inquiry-v1.details.schema.json
 * → details.product), so an analytics row and an inquiry row name the same thing:
 * CORE_KIT, CORE_KIT_PRO, POWER_BOARD, UNDECIDED.
 *
 * NO PII. A path, a product enum, an intent, a CTA id. The mailto address is never
 * sent, and the subject line is mapped onto the fixed product enum rather than
 * transmitted.
 *
 * Inert if gtag never loaded.
 */
(function () {
  "use strict";

  if (window.__rrProgressionBound) return;
  window.__rrProgressionBound = true;

  var STORE_HOST = "orders.ambimat.com";
  var SITE = "roboracer";

  /* Store routes worth counting as commercial intent, and the product each names.
     Keys are paths on STORE_HOST. The PCB category is a product-family browse, not
     a single product, so it carries POWER_BOARD and its own cta_id. */
  var STORE_ROUTES = {
    "/product/roboracer-core-kit": { cta: "store_core_kit", product: "CORE_KIT" },
    "/product/roboracer-core-kit-pro": { cta: "store_core_kit_pro", product: "CORE_KIT_PRO" },
    "/product-category/pcb-board": { cta: "store_pcb_category", product: "POWER_BOARD" },
  };

  /* In-site product surfaces. Reading a use case is not product interest; opening
     the platform guide or the specification is. */
  var PRODUCT_PATHS = {
    "/autonomous-racing-robotics-kit": "CORE_KIT",
    "/specifications": "CORE_KIT",
  };

  /* Quote and support desks. The address is a routing fact, not data to transmit:
     it selects the intent and is then discarded. */
  var DESKS = {
    "roboracer@ambimat.com": { cta: "quote_email", intent: "quote" },
    "support@ambimat.com": { cta: "support_email", intent: "support" },
    "business.development@ambimat.com": { cta: "partnership_email", intent: "partnership" },
  };

  function send(name, params) {
    try {
      if (typeof window.gtag !== "function") return;
      var out = params || {};
      out.source_site = SITE;
      /* Campaign that brought the visitor in, from the shared first-party record on
         `.ambimat.com`. GA4's own campaign is session-scoped and this journey spans
         days, so without these a quote raised next week names nothing. Absent module,
         or a visitor who refused analytics, simply yields no attr_* keys. */
      var attr = window.ambimatAttribution;
      if (attr && typeof attr.eventParams === "function") {
        var extra = attr.eventParams();
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k]) out[k] = extra[k];
        }
      }
      window.gtag("event", name, out);
    } catch {
      /* analytics must never break the page */
    }
  }

  function normalise(pathname) {
    return (
      String(pathname || "")
        .replace(/\.html$/, "")
        .replace(/\/+$/, "") || "/"
    );
  }

  /* Which kit a quote is about, from the mailto subject only. The two kit-specific
     links carry it; the bare address does not. Mapped onto the Central Intake enum,
     never transmitted as free text. */
  function quoteProduct(href) {
    var m = /[?&]subject=([^&]*)/i.exec(href);
    var v = m ? decodeURIComponent(m[1]).toLowerCase() : "";
    if (v.indexOf("core kit pro") !== -1) return "CORE_KIT_PRO";
    if (v.indexOf("core kit") !== -1) return "CORE_KIT";
    return "UNDECIDED";
  }

  document.addEventListener(
    "click",
    function (e) {
      var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!link) return;

      var href = link.getAttribute("href") || "";
      var source = normalise(window.location.pathname);

      /* Mail and phone desks. Counted anywhere on the page, footer included,
         because choosing a channel is intent wherever it happens. */
      if (/^mailto:/i.test(href)) {
        var addr = href
          .replace(/^mailto:/i, "")
          .split("?")[0]
          .toLowerCase();
        var desk = DESKS[addr];
        send("cta_click", {
          cta_id: desk ? desk.cta : "other_email",
          intent: desk ? desk.intent : "contact",
          destination_type: "mailto",
          product: desk && desk.intent === "quote" ? quoteProduct(href) : undefined,
          source_page: source,
        });
        return;
      }
      if (/^tel:/i.test(href)) {
        send("cta_click", {
          cta_id: "phone",
          intent: "contact",
          destination_type: "tel",
          source_page: source,
        });
        return;
      }

      // Everything below is in-content only: the same CTAs also sit in the shared
      // footer, and counting those would measure the template instead of intent.
      if (!link.closest("main#main")) return;

      var path = normalise(link.pathname);

      if (link.hostname === STORE_HOST) {
        var route = STORE_ROUTES[path];
        if (route) {
          send("cta_click", {
            cta_id: route.cta,
            intent: "purchase_intent",
            destination_type: "store",
            product: route.product,
            source_page: source,
          });
        }
        return;
      }

      if (link.hostname !== window.location.hostname) return;

      if (PRODUCT_PATHS[path] && path !== source) {
        send("cta_click", {
          cta_id: "product_detail",
          intent: "research",
          destination_type: "internal",
          product: PRODUCT_PATHS[path],
          source_page: source,
        });
        return;
      }

      /* The contact page is where the Central Intake form lives. The hash says which
         CTA sent them — #order is "Request a Core Kit quote". Skipped on /contact
         itself, where the visitor has already arrived. */
      if (path === "/contact" && source !== "/contact") {
        send("cta_click", {
          cta_id: "contact_page_" + ((link.hash || "").replace(/^#/, "").slice(0, 24) || "top"),
          intent: "quote",
          destination_type: "internal",
          source_page: source,
        });
      }
    },
    { passive: true },
  );
})();
