/* Ambimat estate — first-party campaign attribution.
 *
 * CANONICAL: ambimat-site/estate/analytics/ambi-attribution.js — deployed byte-identical to
 * ambimat.com, orders.ambimat.com and roboracer.ambimat.com. Edit here, redeploy all three.
 * Design, consent policy and privacy: estate/analytics/ATTRIBUTION_DESIGN.md
 *
 * Kept deliberately terse: roboracer ships JS unminified under an error-level Lighthouse
 * script-weight gate, so a comment byte here is a byte on every page of that site.
 *
 * GA4's campaign is session-scoped and this buying journey spans days, so the first-touch
 * campaign is stored on a `.ambimat.com` cookie and attached to the lead server-side.
 * Gated on estate consent; cleared on an explicit refusal.
 */
(function (w, d) {
  "use strict";

  var COOKIE = "ambimat_attr";
  var CONSENT_COOKIE = "ambimat_consent";
  var DOMAIN = ".ambimat.com";
  var TTL_DAYS = 90;
  var VERSION = 1;

  /* utm_term is deliberately absent: paid-search field, these campaigns are email. */
  var FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];

  function readCookie(name) {
    try {
      var m = d.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
      return m ? decodeURIComponent(m[1]) : "";
    } catch {
      return "";
    }
  }

  function writeCookie(name, value, days) {
    try {
      var exp = new Date(Date.now() + days * 864e5).toUTCString();
      d.cookie =
        name +
        "=" +
        encodeURIComponent(value) +
        ";expires=" + exp +
        ";path=/;domain=" + DOMAIN +
        ";SameSite=Lax" +
        (w.location.protocol === "https:" ? ";Secure" : "");
    } catch {
      /* storage must never break the page */
    }
  }

  function clearCookie(name) {
    try {
      d.cookie =
        name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + DOMAIN;
    } catch {
      /* blocked cookie jar */
    }
  }

  /* Only an explicit refusal blocks storage. See ATTRIBUTION_DESIGN.md#consent. */
  function refused() {
    return readCookie(CONSENT_COOKIE) === "denied";
  }

  /* Hand-parsed so the module needs no global beyond window/document. */
  function params() {
    var out = {};
    var qs = String(w.location.search || "").replace(/^\?/, "");
    if (!qs) return out;
    var parts = qs.split("&");
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf("=");
      if (eq < 1) continue;
      var key = parts[i].slice(0, eq);
      if (FIELDS.indexOf(key) === -1) continue;
      var raw = parts[i].slice(eq + 1).replace(/\+/g, " ");
      var val = "";
      try {
        val = decodeURIComponent(raw);
      } catch {
        val = raw;
      }
      if (val) out[key] = val.slice(0, 100);
    }
    return out;
  }

  function stored() {
    var raw = readCookie(COOKIE);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      return o && o.v === VERSION ? o : null;
    } catch {
      return null;
    }
  }

  function capture() {
    if (refused()) {
      clearCookie(COOKIE);
      return null;
    }

    var existing = stored();
    var p = params();

    /* First touch wins: the inquiry is credited to the email that brought them in. */
    if (existing) return existing;
    if (!p.utm_campaign && !p.utm_source) return null;

    var rec = {
      v: VERSION,
      src: p.utm_source || "",
      med: p.utm_medium || "",
      cmp: p.utm_campaign || "",
      cnt: p.utm_content || "",
      host: w.location.hostname,
      path: String(w.location.pathname || "/").slice(0, 200),
      ts: new Date().toISOString(),
    };
    writeCookie(COOKIE, JSON.stringify(rec), TTL_DAYS);
    return rec;
  }

  var record = capture();

  /* Exposed for the funnel events and for QA. */
  w.ambimatAttribution = {
    get: function () {
      return refused() ? null : stored();
    },
    /* GA4 event parameters. Short names: GA4 caps names at 40 chars, values at 100. */
    eventParams: function () {
      var r = this.get();
      if (!r) return {};
      return {
        attr_campaign: r.cmp,
        attr_source: r.src,
        attr_medium: r.med,
        attr_content: r.cnt,
        attr_landing_host: r.host,
      };
    },
    clear: function () {
      clearCookie(COOKIE);
    },
  };

  /* Fires once, only on the hit that created the record, so it can never become a second
     page_view. Inert if gtag never loaded. */
  if (record && record.ts && Object.keys(params()).length) {
    var fire = function () {
      try {
        if (typeof w.gtag !== "function") return;
        w.gtag("event", "campaign_landing", {
          attr_campaign: record.cmp,
          attr_source: record.src,
          attr_medium: record.med,
          attr_content: record.cnt,
          attr_landing_host: record.host,
          attr_landing_path: record.path,
        });
      } catch {
      /* blocked cookie jar */
    }
    };
    if (d.readyState === "loading") {
      d.addEventListener("DOMContentLoaded", fire, { once: true });
    } else {
      fire();
    }
  }
})(window, document);
