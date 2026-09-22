/* RoboRacer — commercial-progression click events.
 *
 * RoboRacer holds four of the estate's named AEO wins and ranks #1 organically
 * on five of eight procurement-shaped queries, and until now not one step of
 * its buying journey was measured: the pages carry a gtag config and nothing
 * else, so page_view was the only signal the property has ever produced.
 *
 * The journey this instruments is the real one, which is NOT a checkout:
 *
 *   landing page -> kit / specifications -> "Request a Core Kit quote"
 *                -> /contact.html#order  -> mailto:roboracer@ambimat.com
 *
 * contact.html states it plainly — "purchases are completed against an Ambimat
 * quotation, never through an online checkout" — so the mailto: click is the
 * terminal enquiry, not a mid-funnel nicety, and the orders.ambimat.com links
 * are price/product references rather than a cart. Those references also cross
 * a GA4 property boundary (this host reports to G-KCRP2C9ZCL, orders.ambimat.com
 * to G-03T01GG8K1), so a click toward one is invisible here unless it is sent.
 *
 * Event names are the estate's existing vocabulary, not new ones:
 *   product_interest       moved from reading to looking at what we sell
 *   product_contact_click  asked to be contacted from in-content copy
 *   contact_method_click   chose a channel (which channel, never the address)
 *
 * In-content clicks are scoped to main#main: the quote CTA also sits in the
 * footer of all eight pages, and counting that would measure the template
 * instead of intent. Everything is derived from href, so no markup changed.
 *
 * No PII: a pathname, a slug and a channel word. The mailto subject is mapped
 * onto a fixed three-value vocabulary and the address is never sent.
 *
 * Inert if gtag never loaded.
 */
(function () {
  "use strict";

  if (window.__rrProgressionBound) return;
  window.__rrProgressionBound = true;

  /* Product surfaces. Reading a use case is not product interest; opening the
     platform guide, the specification or a store listing is. */
  var PRODUCT_PATHS = {
    "/autonomous-racing-robotics-kit": "core_kit_platform",
    "/specifications": "core_kit_specifications",
  };

  var STORE_PRODUCTS = {
    "/product/roboracer-core-kit": "core_kit",
    "/product/roboracer-core-kit-pro": "core_kit_pro",
  };

  var STORE_HOST = "orders.ambimat.com";

  function send(name, params) {
    try {
      if (typeof window.gtag !== "function") return;
      window.gtag("event", name, params || {});
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

  /* Which kit the enquiry is about, from the mailto subject only. The two
     kit-specific quote links carry it; the bare address does not. */
  function quoteSubject(href) {
    var subject = /[?&]subject=([^&]*)/i.exec(href);
    var value = subject ? decodeURIComponent(subject[1]).toLowerCase() : "";
    if (value.indexOf("core kit pro") !== -1) return "core_kit_pro";
    if (value.indexOf("core kit") !== -1) return "core_kit";
    return "general";
  }

  document.addEventListener(
    "click",
    function (e) {
      var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!link) return;

      var href = link.getAttribute("href") || "";
      var source = normalise(window.location.pathname);

      /* contact_method_click: the terminal enquiry. Counted anywhere on the
         page, including the footer, because choosing a channel is intent
         wherever it happens. */
      if (/^mailto:/i.test(href)) {
        send("contact_method_click", {
          contact_method: "email",
          quote_subject: quoteSubject(href),
          source_page: source,
        });
        return;
      }
      if (/^tel:/i.test(href)) {
        send("contact_method_click", { contact_method: "phone", source_page: source });
        return;
      }

      // Everything below is in-content only.
      if (!link.closest("main#main")) return;

      var path = normalise(link.pathname);

      if (link.hostname === STORE_HOST) {
        if (STORE_PRODUCTS[path]) {
          send("product_interest", { product: STORE_PRODUCTS[path], source_page: source });
        }
        return;
      }

      if (link.hostname !== window.location.hostname) return;

      if (PRODUCT_PATHS[path] && path !== source) {
        send("product_interest", { product: PRODUCT_PATHS[path], source_page: source });
        return;
      }

      /* product_contact_click: an in-content contact CTA. The hash says which
         one — #order is "Request a Core Kit quote", #pricing is the price
         table. Skipped on /contact itself, where the visitor has arrived. */
      if (path === "/contact" && source !== "/contact") {
        send("product_contact_click", {
          source_page: source,
          contact_section: (link.hash || "").replace(/^#/, "").slice(0, 40) || "top",
        });
      }
    },
    { passive: true },
  );
})();
