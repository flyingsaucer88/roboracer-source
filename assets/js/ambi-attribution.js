/* Ambimat estate — first-party campaign attribution.
 * Canonical source: ambimat-site/estate/analytics/ambi-attribution.js
 * Deployed byte-identical to ambimat.com, orders.ambimat.com and roboracer.ambimat.com.
 *
 * WHAT THIS SOLVES
 *
 * GA4 session attribution is not durable enough for this estate's buying journey.
 * The RoboRacer path is landing -> kit page -> orders.ambimat.com product -> back to
 * ambimat.com -> contact form, and it routinely spans more than one GA4 session: the
 * quote arrives days later, and GA4's session-scoped `campaign` has already decayed to
 * (direct) by then. The September 2026 blast proved the cost of that - the Orders links
 * carried no UTMs at all, so ~300 sessions of genuine product interest were recorded as
 * (direct)/(none) and could never be tied back to the email.
 *
 * So the campaign is written once, first-touch, to a first-party cookie on the shared
 * parent domain `.ambimat.com`. Every Ambimat subdomain can read it, and the contact form
 * on ambimat.com can attach it to the server-side lead record - which is the only place a
 * lead is authoritative. GA4 remains behavioural measurement; this is the attribution.
 *
 * WHY A COOKIE AND NOT localStorage
 *
 * localStorage is per-origin. roboracer.ambimat.com and ambimat.com cannot read each
 * other's. A cookie scoped to `.ambimat.com` is the only shared first-party channel
 * across these hosts, and it is the same mechanism `_ga` itself already uses here - see
 * the estate consent broadcast, which publishes `ambimat_consent` the same way.
 *
 * FIRST-TOUCH, NOT LAST-TOUCH
 *
 * The question the owner asks is "which email produced this inquiry", so the first
 * campaign that brought the visitor in wins and is never overwritten by a later visit.
 * A later campaign only writes if the stored record has expired.
 *
 * CONSENT
 *
 * This is analytics storage and is gated exactly like analytics on the host it runs on:
 * an explicit estate-wide refusal (`ambimat_consent=denied`, published by CookieYes on
 * ambimat.com and scoped to `.ambimat.com`) blocks the write and clears anything already
 * stored. A visitor who refuses is deliberately unattributed, and the hidden lead fields
 * are then empty. That is the correct outcome, not a defect.
 *
 * PRIVACY
 *
 * Campaign metadata only: source, medium, campaign, content, the landing host and path,
 * and a timestamp. No identifiers are generated, nothing is derived from the device, and
 * no value is ever read from a form field. This is not a fingerprint - it stores only
 * what the visitor's own inbound link already declared.
 */
(function (w, d) {
  "use strict";

  var COOKIE = "ambimat_attr";
  var CONSENT_COOKIE = "ambimat_consent";
  var DOMAIN = ".ambimat.com";
  var TTL_DAYS = 90;
  var VERSION = 1;

  /* utm_term is deliberately absent: it is a paid-search field, this estate's campaigns
     are email, and every field stored here has to earn its place in a lead record. */
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
      /* a blocked cookie jar is not an error worth surfacing */
    }
  }

  /* Only an explicit refusal blocks storage. An absent decision is not a refusal: the
     subdomains carry no banner, so treating "no decision" as denial there would make it
     impossible for a campaign visitor ever to be attributed while never actually having
     been asked. ambimat.com, which does carry the banner, is denied-by-default in its own
     Consent Mode configuration, and publishes an explicit decision here either way. */
  function refused() {
    return readCookie(CONSENT_COOKIE) === "denied";
  }

  /* Parsed by hand rather than with URLSearchParams: it keeps the module free of any
     global beyond window/document, which is what lets the identical bytes run on a static
     page, inside WordPress and inside WooCommerce without a build step. */
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

    /* First touch wins. A campaign already on file is never overwritten, so the inquiry
       is credited to the email that actually brought the visitor into the estate. */
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

  /* Expose for the funnel events and for QA. Read-only by convention. */
  w.ambimatAttribution = {
    get: function () {
      return refused() ? null : stored();
    },
    /* GA4 event parameters. Named to match the estate's existing vocabulary and kept
       short because GA4 caps parameter names at 40 chars and values at 100. */
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

  /* One event on the arrival that actually carried the campaign, so the unified property
     records the entry point even if the visitor bounces before any other interaction.
     Fires only on the hit that created the record - never on subsequent pages, which is
     what keeps it from becoming a second page_view. */
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
      /* a blocked cookie jar is not an error worth surfacing */
    }
    };
    if (d.readyState === "loading") {
      d.addEventListener("DOMContentLoaded", fire, { once: true });
    } else {
      fire();
    }
  }
})(window, document);
