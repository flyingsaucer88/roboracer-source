/**
 * Ambimat Central Intake Platform — shared client module.
 *
 * This file is IDENTICAL on every Ambimat site except the CONFIG block below.
 * Fix a bug here and copy it out; do not fork per-site behaviour into the page.
 *
 * ONE switch decides what happens on submit: CONFIG.endpoint.
 *
 *   null  → no backend for this site yet. The form validates, then composes
 *           the message in the visitor's own mail client. It NEVER says an
 *           inquiry was received, recorded or registered, because nothing on
 *           our side has stored anything.
 *   set   → POST the canonical payload, and report success ONLY from what the
 *           server actually returns — never optimistically.
 *
 * AWS cutover per site is therefore one line: set `endpoint`.
 *
 * reCAPTCHA v3 runs ONLY immediately before a real submission. A displayed
 * form must not execute tokens, so with no endpoint no token is ever fetched.
 * The token is verified server-side; nothing here can or does check it, and
 * the secret never reaches the browser.
 */
(function (w, d) {
  'use strict';

  // ── CONFIG — the only part that differs between sites ────────────────────
  // Kept here rather than in an inline <script> because every Ambimat site
  // sends a Content-Security-Policy without 'unsafe-inline' in script-src, so
  // an inline config block would be silently blocked in production.
  var CONFIG = {
    // AWS cutover is exactly this one line: point it at the central API.
    endpoint: null,
    // 'json' for the central API. 'form' for the legacy PHP endpoint on
    // AmbiSecure, which reads $_POST.
    encoding: 'json',
    // Wire-name overrides for a legacy endpoint, e.g. { subject: 'purpose' }.
    fieldAliases: null,
    // Where to go after the server confirms. Used by AmbiSecure, whose
    // thank-you page is what fires its lead conversion event.
    successRedirect: null,
    // reCAPTCHA v3 PUBLIC site key — safe in client code by design; the
    // matching SECRET lives only in Google's console (later AWS Secrets
    // Manager) and is used only server-side to verify the token. Registered
    // 2026-09-03 on ambimat.com, which covers every *.ambimat.com first-level
    // subdomain. It does nothing until `endpoint` is set.
    // At cutover also add to this site's CSP:
    //   script-src  https://www.google.com https://www.gstatic.com
    //   frame-src   https://www.google.com
    //   connect-src <the api origin>
    recaptchaSiteKey: '6LcKy6YtAAAAALdQdvCua2dS51PXJFvqrBeyaZiO',
    // Marketing-consent capture. OFF until the Central Intake API can durably
    // STORE the consent evidence. While false, the consent controls are never
    // put in the DOM at all, so a visitor cannot tick a box whose answer we
    // would then throw away — which would leave Ambimat believing a consent
    // existed. Flip to true only once the backend records
    // consent + timestamp + sourceSite + sourceForm + textVersion.
    consentCapture: false,
    // Terms & Conditions acknowledgement. A SEPARATE flag from consentCapture:
    // acknowledging Terms and opting into marketing are different purposes and
    // must never ride on one switch. OFF until the backend can durably store
    // the acceptance state, version and server-side timestamp.
    termsCapture: false,
    // VERIFIED 2026-09-03: this URL returns 200 and is the existing canonical
    // Ambimat Terms page (h1 "Terms & Conditions", last updated 2024-03-27);
    // /terms/ already 301s to it. The often-assumed /terms-and-conditions/ is
    // a 404 on ambimat.com — do not "correct" this to that slug without first
    // creating it, or the control would link visitors to a missing page.
    termsUrl: 'https://ambimat.com/terms-conditions/',
    termsVersion: '1.0',
    // Which site-specific typed schema this form collects (runbook v1.5 §29.4).
    // The registry itself is generated below; the server re-derives this from
    // (sourceSite, sourceForm) and rejects a payload that disagrees.
    schemaId: 'roboracer-inquiry-v1',
    sourceSite: 'roboracer.ambimat.com',
    mailto: 'business.development@ambimat.com',
    subjectPrefix: 'RoboRacer enquiry'
  };
  // ── end CONFIG ───────────────────────────────────────────────────────────

  var CFG = w.INTAKE || CONFIG;
  var ENDPOINT = CFG.endpoint || null;
  var SITE_KEY = CFG.recaptchaSiteKey || null;
  var ACTION = 'inquiry_submit';

  // The canonical intake schema. Anything else a form collects is preserved
  // under `extra` rather than dropped, so site-specific questions survive.
  var CANONICAL = ['name', 'email', 'phone', 'company', 'country', 'subject', 'message'];

  // ── Site-specific typed details (runbook v1.5 §29) ───────────────────────
  // Everything from here to END GENERATED is written by
  // ambimat-site/central-intake/build-intake-schemas.mjs from
  // central-intake/intake-schemas.json, which is the single source of truth
  // this client, the Lambda validators and the parity test all read. Do not
  // hand-edit it: `node build-intake-schemas.mjs --check` fails if you do.
  //
  // This region — and only this region — differs between sites: it carries just
  // the one schema CONFIG.schemaId names, so RoboRacer's contact page does not
  // ship AmbiPower's meter enums. Everything below it is byte-identical estate
  // wide, which test-schema-parity.mjs asserts.
  //
  // The detail inputs are named d_<key> so they cannot collide with an
  // envelope field and are never swept into `extra`. Only the fields whose
  // condition currently holds are in the DOM as visible, required inputs, so a
  // visitor sees a short form until they say what they are asking about.
  /* BEGIN GENERATED SCHEMA REGISTRY */
  var SCHEMAS = {
    "roboracer-inquiry-v1": {"schemaVersion":1,"inquiryType":{"key":"inquiryType","label":"Inquiry type","required":true,"options":[{"value":"QUOTATION","legacy":"quote","label":"Request a quotation"},{"value":"PRICING_BULK_EDUCATION","legacy":"pricing","label":"Pricing / bulk & education"},{"value":"SHIPPING_DELIVERY","legacy":"shipping","label":"Shipping and delivery"},{"value":"TECHNICAL_BRINGUP","legacy":"technical","label":"Technical / bring-up question"},{"value":"ROS2_SOFTWARE","legacy":"ros2","label":"ROS 2 and software"},{"value":"SUPPORT_IN_WINDOW","legacy":"support","label":"Support (60-day window)"},{"value":"PARTNERSHIP_RESELLER","legacy":"partnership","label":"Partnership / reseller"},{"value":"GENERAL","legacy":"general","label":"General"}]},"purposeAliases":{"quote-core-kit":{"inquiryType":"QUOTATION","details":{"product":"CORE_KIT"}},"quote-core-kit-pro":{"inquiryType":"QUOTATION","details":{"product":"CORE_KIT_PRO"}}},"fields":[{"key":"product","label":"Product of interest","type":"select","required":true,"showWhen":{"inquiryType":["QUOTATION","PRICING_BULK_EDUCATION","SHIPPING_DELIVERY"]},"options":[{"value":"CORE_KIT","label":"RoboRacer Core Kit"},{"value":"CORE_KIT_PRO","label":"RoboRacer Core Kit Pro"},{"value":"POWER_BOARD","label":"RoboRacer Power Board"},{"value":"UNDECIDED","label":"Not decided yet"}]},{"key":"quantity","label":"Quantity","type":"number","required":true,"min":1,"max":500,"showWhen":{"inquiryType":["QUOTATION","PRICING_BULK_EDUCATION","SHIPPING_DELIVERY"]}},{"key":"buyerType","label":"Buying as","type":"select","required":true,"showWhen":{"inquiryType":["QUOTATION","PRICING_BULK_EDUCATION","SHIPPING_DELIVERY"]},"options":[{"value":"INSTITUTION","label":"An institution or company"},{"value":"INDIVIDUAL","label":"An individual"}]},{"key":"procurementNeeds","label":"Your procurement process needs","type":"multiselect","required":false,"showWhen":{"buyerType":["INSTITUTION"]},"options":[{"value":"PROFORMA_INVOICE","label":"A proforma invoice"},{"value":"GST_ON_QUOTATION","label":"A GST number on the quotation"},{"value":"SUPPLIER_REGISTRATION","label":"Supplier registration documents"},{"value":"NONE","label":"Nothing in particular"}]},{"key":"intendedUse","label":"Intended use","type":"select","required":true,"showWhen":{"inquiryType":["QUOTATION","PRICING_BULK_EDUCATION"]},"options":[{"value":"RESEARCH","label":"Research"},{"value":"TEACHING","label":"Teaching"},{"value":"COMPETITION","label":"Competition"},{"value":"OTHER","label":"Other"}]},{"key":"deliveryCity","label":"Delivery city","type":"text","required":false,"maxlength":120,"showWhen":{"inquiryType":["QUOTATION","SHIPPING_DELIVERY"]}},{"key":"targetDate","label":"Target date","type":"date","required":false,"hint":"Semester start, competition date or any deadline the quotation has to meet.","showWhen":{"inquiryType":["QUOTATION","PRICING_BULK_EDUCATION"]}},{"key":"variantRequirement","label":"Variant requirement","type":"text","required":false,"maxlength":400,"hint":"A specific Jetson or LiDAR variant, or an extra sensor to power from the AE170 spare rails.","showWhen":{"inquiryType":["QUOTATION","TECHNICAL_BRINGUP"]}},{"key":"orderReference","label":"Order reference","type":"text","required":false,"maxlength":64,"showWhen":{"inquiryType":["SUPPORT_IN_WINDOW"]}}]}
  };
  /* END GENERATED SCHEMA REGISTRY */

  var SCHEMA = (CFG.schemaId && SCHEMAS[CFG.schemaId]) || null;
  var DPREFIX = 'd_';


  // ── Marketing consent ────────────────────────────────────────────────────
  // Two SEPARATE purposes. Product announcements and job alerts are different
  // things to different people, so they are never merged into one
  // "marketing" tick, never pre-checked, and never a condition of submitting.
  // Bump CONSENT_TEXT_VERSION whenever a label below changes: the stored
  // evidence records which wording a person actually agreed to.
  var CONSENT_TEXT_VERSION = '2026-09-03.1';
  var CONSENT_FIELDS = [
    { name: 'productUpdatesConsent',
      label: 'I would like to receive Ambimat product updates and new product launch announcements by email.' },
    { name: 'jobAlertsConsent',
      label: 'I would like to receive Ambimat job opening and career opportunity notifications by email.' }
  ];

  // ── Terms & Conditions acknowledgement ───────────────────────────────────
  // Owner-approved behaviour: the box is CHECKED BY DEFAULT, the visitor may
  // uncheck it, and either state submits. Unchecking is a recorded answer, not
  // a validation failure — it must never gate the inquiry.
  //
  // Three states must stay distinguishable downstream, which is why the payload
  // omits `terms` entirely when the control was not shown:
  //   accepted      -> terms.accepted === true
  //   declined      -> terms.accepted === false   (they saw it and unticked it)
  //   not captured  -> no `terms` key at all      (never presented)
  // Writing false for "not presented" would be a lie about what the person did.
  function injectTerms(form) {
    if (!CFG.termsCapture) { return; }                 // no backend → no control
    if (form.querySelector('[data-intake-terms]')) { return; }
    var btn = form.querySelector('[type="submit"]');
    if (!btn) { return; }
    var host = btn.closest ? btn.closest('.intake-row') : null;
    if (!host || !host.parentNode) { return; }

    var wrap = d.createElement('div');
    wrap.className = 'intake-row intake-row--full intake-terms';
    wrap.setAttribute('data-intake-terms', CFG.termsVersion || '');
    // `checked` is set as a property after insertion as well as in the markup,
    // so the default survives browsers that re-parse the attribute.
    wrap.innerHTML =
      '<label class="intake-consent-item">' +
        '<input type="checkbox" name="termsAccepted" value="yes" checked> ' +
        '<span>I have read and accept the ' +
          '<a href="' + (CFG.termsUrl || '#') + '" target="_blank" rel="noopener">Terms and Conditions</a>.' +
        '</span>' +
      '</label>' +
      '<p class="intake-hint">You can submit this form either way &mdash; unticking this does not stop your message reaching us.</p>';
    host.parentNode.insertBefore(wrap, host);
    var cb = wrap.querySelector('[name="termsAccepted"]');
    if (cb) { cb.checked = true; }
  }

  function termsPayload(form) {
    if (!CFG.termsCapture) { return null; }             // not presented
    var cb = form.querySelector('[name="termsAccepted"]');
    if (!cb) { return null; }                           // not rendered
    return {
      accepted: !!cb.checked,
      version: CFG.termsVersion || null,
      url: CFG.termsUrl || null
      // The server assigns termsRecordedAt and re-validates the version.
    };
  }

  function injectConsent(form) {
    if (!CFG.consentCapture) { return; }               // no backend → no controls
    if (form.querySelector('[data-intake-consent]')) { return; }
    var submitRow = form.querySelector('[type="submit"]');
    if (!submitRow) { return; }
    var host = submitRow.closest ? submitRow.closest('.intake-row') : null;
    if (!host || !host.parentNode) { return; }

    var wrap = d.createElement('div');
    wrap.className = 'intake-row intake-row--full intake-consent';
    wrap.setAttribute('data-intake-consent', CONSENT_TEXT_VERSION);
    var html = '<p class="intake-consent-lead">Optional &mdash; you can submit this form without choosing either.</p>';
    CONSENT_FIELDS.forEach(function (c) {
      // No `checked`: consent is never pre-granted.
      html += '<label class="intake-consent-item"><input type="checkbox" name="' + c.name +
              '" value="yes"> <span>' + c.label + '</span></label>';
    });
    html += '<p class="intake-hint">See our <a href="' + (CFG.privacyUrl || '/privacy/') +
            '">privacy notice</a>. You can withdraw either at any time.</p>';
    wrap.innerHTML = html;
    host.parentNode.insertBefore(wrap, host);
  }

  function consentPayload(form) {
    if (!CFG.consentCapture) { return null; }
    var out = { textVersion: CONSENT_TEXT_VERSION };
    CONSENT_FIELDS.forEach(function (c) {
      var el = form.querySelector('[name="' + c.name + '"]');
      // The client only ever reports what was ticked. The server assigns the
      // authoritative timestamp and validates the text version.
      out[c.name] = !!(el && el.checked);
    });
    return out;
  }

  function setStatus(form, kind, msg, asHtml) {
    var el = form.querySelector('[data-form-status]');
    if (!el) { return; }
    el.className = 'intake-status is-visible intake-status--' + kind;
    if (asHtml) { el.innerHTML = msg; } else { el.textContent = msg; }
    // Errors must reach a screen reader immediately; a quiet status does not.
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }

  function fieldErr(form, name, on) {
    var input = form.querySelector('[name="' + name + '"]');
    var err = form.querySelector('[data-err-for="' + name + '"]');
    if (input) { input.setAttribute('aria-invalid', on ? 'true' : 'false'); }
    if (err) { err.hidden = !on; }
  }

  // ── Typed details: render, reveal, read ──────────────────────────────────

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** The subject <select> still carries the legacy lowercase option values that
   *  every marketing deep-link uses, so the enum is resolved from them here
   *  rather than by rewriting nine forms' markup. */
  function inquiryTypeOf(form) {
    if (!SCHEMA || !SCHEMA.inquiryType) { return ''; }
    var sel = form.querySelector('select[name="subject"]');
    var v = sel ? sel.value : '';
    if (!v) { return ''; }
    var opts = SCHEMA.inquiryType.options;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].legacy === v || opts[i].value === v) { return opts[i].value; }
    }
    return '';
  }

  /** Current value of one detail field: a string, or an array for a checkbox set. */
  function detailValue(form, f) {
    var els = form.querySelectorAll('[name="' + DPREFIX + f.key + '"]');
    if (!els.length) { return f.type === 'multiselect' ? [] : ''; }
    if (f.type === 'multiselect') {
      var out = [];
      Array.prototype.forEach.call(els, function (el) { if (el.checked) { out.push(el.value); } });
      return out;
    }
    return (els[0].value || '').trim();
  }

  /** A field is shown when every clause of showWhen holds. No showWhen = always. */
  function isShown(form, f, itype) {
    var w = f.showWhen;
    if (!w) { return true; }
    var key;
    for (key in w) {
      if (!Object.prototype.hasOwnProperty.call(w, key)) { continue; }
      var wanted = w[key];
      if (key === 'inquiryType') {
        if (wanted.indexOf(itype) === -1) { return false; }
      } else if (key === 'inquiryTypeNot') {
        if (!itype || wanted.indexOf(itype) !== -1) { return false; }
      } else {
        // Depends on another detail field, e.g. procurementNeeds on buyerType.
        var dep = null;
        for (var i = 0; i < SCHEMA.fields.length; i++) {
          if (SCHEMA.fields[i].key === key) { dep = SCHEMA.fields[i]; break; }
        }
        if (!dep || !isShown(form, dep, itype)) { return false; }
        var have = detailValue(form, dep);
        var hit = false;
        (typeof have === 'string' ? [have] : have).forEach(function (v) {
          if (wanted.indexOf(v) !== -1) { hit = true; }
        });
        if (!hit) { return false; }
      }
    }
    return true;
  }

  function fieldMarkup(f, idBase) {
    var id = idBase + '-' + f.key;
    var nm = DPREFIX + f.key;
    var req = f.required
      ? ' <span class="intake-req" aria-hidden="true">*</span>'
      : ' <span class="intake-opt">(optional)</span>';
    var describedBy = (f.hint ? id + '-hint ' : '') + id + '-err';
    var h = '';

    if (f.type === 'multiselect') {
      h += '<div class="intake-row intake-row--full intake-consent" data-intake-detail="' + esc(f.key) + '" hidden style="display:none">';
      h += '<p class="intake-consent-lead" id="' + id + '-legend">' + esc(f.label) + req + '</p>';
      h += '<div role="group" aria-labelledby="' + id + '-legend">';
      f.options.forEach(function (o, i) {
        h += '<label class="intake-consent-item"><input type="checkbox" name="' + nm +
             '" id="' + id + '-' + i + '" value="' + esc(o.value) + '"> <span>' + esc(o.label) + '</span></label>';
      });
      h += '</div>';
    } else {
      h += '<div class="intake-row" data-intake-detail="' + esc(f.key) + '" hidden style="display:none">';
      h += '<label for="' + id + '">' + esc(f.label) + req + '</label>';
      if (f.type === 'select') {
        h += '<select id="' + id + '" name="' + nm + '" aria-describedby="' + describedBy + '">';
        h += '<option value="">Select one</option>';
        f.options.forEach(function (o) {
          h += '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
        });
        h += '</select>';
      } else {
        var t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : (f.type === 'url' ? 'url' : 'text'));
        h += '<input type="' + t + '" id="' + id + '" name="' + nm + '"';
        if (f.maxlength) { h += ' maxlength="' + f.maxlength + '"'; }
        if (f.min !== undefined) { h += ' min="' + f.min + '"'; }
        if (f.max !== undefined) { h += ' max="' + f.max + '"'; }
        if (f.step !== undefined) { h += ' step="' + f.step + '"'; }
        h += ' aria-describedby="' + describedBy + '">';
      }
    }
    if (f.hint) { h += '<p class="intake-hint" id="' + id + '-hint">' + esc(f.hint) + '</p>'; }
    h += '<p class="intake-err" id="' + id + '-err" data-err-for="' + nm + '" hidden>Please complete this field.</p>';
    h += '</div>';
    return h;
  }

  /** Build every detail row once, hidden, immediately after the subject row. */
  function renderDetails(form) {
    if (!SCHEMA || !SCHEMA.fields || !SCHEMA.fields.length) { return; }
    if (form.querySelector('[data-intake-detail]')) { return; }
    var sel = form.querySelector('select[name="subject"]');
    if (!sel) { return; }
    var anchor = sel.closest ? sel.closest('.intake-row') : null;
    if (!anchor || !anchor.parentNode) { return; }

    var idBase = (form.getAttribute('data-intake-form') || 'intake') + '-d';
    var html = '';
    if (SCHEMA.notice) {
      html += '<div class="intake-row intake-row--full"><p class="intake-hint"><strong>'
           + esc(SCHEMA.notice) + '</strong></p></div>';
    }
    SCHEMA.fields.forEach(function (f) { html += fieldMarkup(f, idBase); });

    // Each row is inserted as a DIRECT child of .intake-grid so it is a real
    // grid item and inherits the form's own responsive two-column layout — and
    // collapses to one column under the same 640px breakpoint as every field
    // above it. A wrapper element with display:contents would do the same on
    // paper, but Safari removed display:contents subtrees from the
    // accessibility tree until 15.4, which would silently unlabel these inputs
    // for a screen reader. No wrapper, no bug.
    var tmp = d.createElement('div');
    tmp.innerHTML = html;
    var at = anchor;
    while (tmp.firstElementChild) {
      var row = tmp.firstElementChild;
      at.parentNode.insertBefore(row, at.nextSibling);
      at = row;
    }

    // Any change can change what is relevant, so one delegated listener covers
    // the subject select and every detail control including ones revealed later.
    form.addEventListener('change', function () { syncDetails(form); });
    syncDetails(form);
  }

  /** Show or hide each row and keep `required` in step, so validate() — which
   *  reads [required] — never demands a field the visitor cannot see. */
  function syncDetails(form) {
    if (!SCHEMA || !SCHEMA.fields) { return; }
    var itype = inquiryTypeOf(form);
    SCHEMA.fields.forEach(function (f) {
      var row = form.querySelector('[data-intake-detail="' + f.key + '"]');
      if (!row) { return; }
      var show = isShown(form, f, itype);
      // `hidden` alone is not enough: intake.css sets `.intake-row{display:flex}`
      // in the author stylesheet, which outranks the user-agent's
      // `[hidden]{display:none}`, so a hidden row would still be painted. The
      // attribute is kept for assistive technology; the inline style is what
      // actually removes it from the layout.
      row.hidden = !show;
      row.style.display = show ? '' : 'none';
      var els = form.querySelectorAll('[name="' + DPREFIX + f.key + '"]');
      Array.prototype.forEach.call(els, function (el) {
        if (show && f.required && f.type !== 'multiselect') {
          el.setAttribute('required', 'required');
          el.setAttribute('aria-required', 'true');
        } else {
          el.removeAttribute('required');
          el.removeAttribute('aria-required');
        }
        // A hidden control must not be reachable by keyboard or announced.
        if (show) { el.removeAttribute('disabled'); } else { el.disabled = true; }
      });
      if (!show) { fieldErr(form, DPREFIX + f.key, false); }
    });

    // A schema may raise an ENVELOPE field to required for some intents only —
    // AmbiSecure asks for a company on a pilot or a quotation but not on a press
    // enquiry. Enforcing it here rather than in the markup keeps the rule in the
    // one place Lambda will read it from, so the two cannot disagree.
    (SCHEMA.envelopeConditional || []).forEach(function (rule) {
      var el = form.querySelector('[name="' + rule.field + '"]');
      if (!el) { return; }
      var need = rule.required;
      if (rule.unlessInquiryType) { need = need && !!itype && rule.unlessInquiryType.indexOf(itype) === -1; }
      if (need) {
        el.setAttribute('required', 'required');
        el.setAttribute('aria-required', 'true');
      } else {
        el.removeAttribute('required');
        el.removeAttribute('aria-required');
        fieldErr(form, rule.field, false);
      }
      // Keep the visible required marker in step. Most of these labels carry no
      // marker at all today, because the field was unconditionally optional, so
      // one is created the first time it is needed — a field that is required
      // without saying so is the version of this that loses enquiries.
      var row = el.closest ? el.closest('.intake-row') : null;
      var label = row ? row.querySelector('label') : null;
      if (!label) { return; }
      var mark = label.querySelector('.intake-req, .intake-opt');
      if (!mark) {
        mark = d.createElement('span');
        label.appendChild(d.createTextNode(' '));
        label.appendChild(mark);
      }
      mark.className = need ? 'intake-req' : 'intake-opt';
      mark.textContent = need ? '*' : '(optional)';
      if (need) { mark.setAttribute('aria-hidden', 'true'); } else { mark.removeAttribute('aria-hidden'); }
    });
  }

  /** Required multiselects have no [required] to check, so they are checked here. */
  function validateDetails(form) {
    var bad = [];
    if (!SCHEMA || !SCHEMA.fields) { return bad; }
    var itype = inquiryTypeOf(form);
    if (SCHEMA.inquiryType && SCHEMA.inquiryType.required && !itype) { bad.push('subject'); }
    SCHEMA.fields.forEach(function (f) {
      if (f.type !== 'multiselect' || !f.required) { return; }
      if (!isShown(form, f, itype)) { return; }
      if (!detailValue(form, f).length) { bad.push(DPREFIX + f.key); }
    });
    return bad;
  }

  /** The typed `details` map. Only currently-relevant fields are included, which
   *  is the client half of the server rule that an irrelevant field is rejected
   *  rather than stored (§29.3 rule 5). */
  function detailsPayload(form) {
    if (!SCHEMA) { return null; }
    var out = {};
    var itype = inquiryTypeOf(form);
    if (itype) { out.inquiryType = itype; }
    (SCHEMA.fields || []).forEach(function (f) {
      if (!isShown(form, f, itype)) { return; }
      var v = detailValue(form, f);
      if (f.type === 'multiselect') { if (v.length) { out[f.key] = v; } return; }
      if (v === '') { return; }
      out[f.key] = (f.type === 'number') ? Number(v) : v;
    });
    return Object.keys(out).length ? out : null;
  }

  /** One human-readable rendering of `details`, shared by the mail-compose
   *  fallback and by the legacy form-encoded endpoint, so no answer a visitor
   *  gave is silently dropped on a site that has no central API yet. */
  function detailsLines(details) {
    var lines = [];
    if (!details || !SCHEMA) { return lines; }
    if (details.inquiryType && SCHEMA.inquiryType) {
      SCHEMA.inquiryType.options.forEach(function (o) {
        if (o.value === details.inquiryType) { lines.push(SCHEMA.inquiryType.label + ': ' + o.label); }
      });
    }
    (SCHEMA.fields || []).forEach(function (f) {
      if (!(f.key in details)) { return; }
      var v = details[f.key];
      if (f.options) {
        var labels = (typeof v === 'string' ? [v] : v).map(function (val) {
          var lbl = val;
          f.options.forEach(function (o) { if (o.value === val) { lbl = o.label; } });
          return lbl;
        });
        v = labels.join(', ');
      } else if (Array.isArray(v)) { v = v.join(', '); }
      lines.push(f.label + ': ' + v);
    });
    return lines;
  }

  function collect(form) {
    var payload = {}, extra = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'submit') { return; }
      if (el.name === 'website' || el.name === 'ts') { return; }  // handled separately
      // Consent is not an inquiry field: it is carried in its own object with
      // its own evidence, never folded into `extra`.
      if (el.name === 'productUpdatesConsent' || el.name === 'jobAlertsConsent') { return; }
      if (el.name === 'termsAccepted') { return; }   // carried in payload.terms
      // Typed details are read from the schema, never swept into `extra` —
      // `extra` is the untyped safety net for legacy markup and must not become
      // a second, unvalidated transport for a field that has a schema (§29.0).
      if (el.name.indexOf(DPREFIX) === 0) { return; }
      var v = (el.value || '').trim();
      if (CANONICAL.indexOf(el.name) !== -1) { payload[el.name] = v; }
      else if (v) { extra[el.name] = v; }
    });
    if (Object.keys(extra).length) { payload.extra = extra; }

    // Source metadata: derived here, re-derived and trusted only server-side.
    payload.sourceSite = CFG.sourceSite || w.location.hostname;
    payload.sourceForm = form.getAttribute('data-intake-form') || 'contact';
    payload.sourceUrl = w.location.href.split('#')[0];

    // Lets the API reject a double submission without creating two inquiries.
    payload.idempotencyKey = (w.crypto && w.crypto.randomUUID)
      ? w.crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

    // The typed layer. `schemaId` is a claim the server re-derives from
    // (sourceSite, sourceForm) and rejects if it disagrees (§29.3), so nothing
    // here is trusted; it exists so a mismatch is a 400 rather than a silent
    // validation against the wrong schema.
    if (SCHEMA) {
      payload.schemaId = CFG.schemaId;
      payload.schemaVersion = SCHEMA.schemaVersion;
      var details = detailsPayload(form);
      if (details) { payload.details = details; }
    }

    var consent = consentPayload(form);
    if (consent) { payload.consent = consent; }

    // Omitted entirely when the control was never shown, so the backend can
    // record NOT_CAPTURED rather than a false "they declined".
    var terms = termsPayload(form);
    if (terms) { payload.terms = terms; }
    return payload;
  }

  function validate(form) {
    var bad = [];
    Array.prototype.forEach.call(form.querySelectorAll('[required]'), function (el) {
      if (!el.name) { return; }
      var v = (el.value || '').trim();
      var ok = !!v;
      if (ok && el.type === 'email') { ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
      if (ok && el.name === 'message') { ok = v.length >= 10; }
      if (!ok && bad.indexOf(el.name) === -1) { bad.push(el.name); }
    });
    validateDetails(form).forEach(function (n) { if (bad.indexOf(n) === -1) { bad.push(n); } });
    return bad;
  }

  // Compose an email from what was typed. This is a real, working contact
  // route — the visitor sends it themselves from their own mail client — so it
  // is described as exactly that and never as a completed submission.
  function composeMail(form, payload) {
    var to = CFG.mailto || form.getAttribute('data-fallback-email');
    if (!to) { return; }

    var LABEL = {
      name: 'Name', email: 'Email', phone: 'Phone', company: 'Company / organisation',
      country: 'Country', subject: 'Subject', message: 'Message'
    };
    var lines = [];
    CANONICAL.forEach(function (k) {
      // With a schema the enquiry type is reported from `details` under its own
      // human label, so the raw option value is never shown to anyone.
      if (k === 'subject' && payload.details) { return; }
      if (payload[k]) { lines.push(LABEL[k] + ': ' + payload[k]); }
    });
    detailsLines(payload.details).forEach(function (l) { lines.push(l); });
    if (payload.extra) {
      Object.keys(payload.extra).forEach(function (k) {
        lines.push(k.charAt(0).toUpperCase() + k.slice(1) + ': ' + payload.extra[k]);
      });
    }
    if (payload.consent) {
      lines.push('', 'Email preferences requested:');
      lines.push('  Product updates: ' + (payload.consent.productUpdatesConsent ? 'yes' : 'no'));
      lines.push('  Job alerts: ' + (payload.consent.jobAlertsConsent ? 'yes' : 'no'));
      lines.push('  (consent text version ' + payload.consent.textVersion + ')');
    }
    if (payload.terms) {
      lines.push('', 'Terms and Conditions (v' + payload.terms.version + '): '
        + (payload.terms.accepted ? 'accepted' : 'not accepted'));
    }
    lines.push('', '— sent from ' + payload.sourceUrl);

    var tag = payload.subject;
    if (payload.details && payload.details.inquiryType && SCHEMA) {
      SCHEMA.inquiryType.options.forEach(function (o) {
        if (o.value === payload.details.inquiryType) { tag = o.label; }
      });
    }
    var subject = tag
      ? (CFG.subjectPrefix || 'Website enquiry') + ' (' + tag + ')'
      : (CFG.subjectPrefix || 'Website enquiry');

    setStatus(form, 'info',
      'Your email app is opening with these details so you can review and send them to '
      + '<a href="mailto:' + to + '">' + to + '</a>. '
      + 'Nothing has been submitted to us yet — the message reaches us only once you send it. '
      + 'If your email app does not open, please write to '
      + '<a href="mailto:' + to + '">' + to + '</a> directly.', true);

    // Some browsers block assigning window.location to mailto: from inside a
    // submit handler, so trigger it through a transient anchor instead.
    var a = d.createElement('a');
    a.href = 'mailto:' + encodeURIComponent(to)
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(lines.join('\n'));
    a.target = '_self';
    d.body.appendChild(a); a.click(); d.body.removeChild(a);
  }

  function token() {
    // No endpoint means no submission, and therefore no reason to execute
    // reCAPTCHA at all. Never run it just because a form is on screen.
    if (!ENDPOINT || !SITE_KEY || !w.grecaptcha || !w.grecaptcha.execute) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      w.grecaptcha.ready(function () {
        w.grecaptcha.execute(SITE_KEY, { action: ACTION }).then(resolve, function () { resolve(null); });
      });
    });
  }

  // Flatten to the wire. `extra` is folded in for form-encoded legacy
  // endpoints, which have no notion of a nested object.
  function encode(payload, form) {
    var flat = {}, k;
    for (k in payload) {
      if (k === 'extra') { continue; }
      flat[k] = payload[k];
    }
    if (payload.extra) {
      for (k in payload.extra) { if (!(k in flat)) { flat[k] = payload.extra[k]; } }
    }
    if (CFG.fieldAliases) {
      for (k in CFG.fieldAliases) {
        if (k in flat) { flat[CFG.fieldAliases[k]] = flat[k]; delete flat[k]; }
      }
    }
    // Timing signal some endpoints use for bot detection; harmless elsewhere.
    var tsEl = form.querySelector('[name="ts"]');
    if (tsEl) { flat.ts = tsEl.value || String(Math.floor(Date.now() / 1000)); }

    if (CFG.encoding === 'form') {
      // A form-encoded body has no nested objects: URLSearchParams would send
      // `details` as the string "[object Object]". It goes over as JSON, plus a
      // rendered copy for the notification email, because the labels live in
      // this file and the legacy endpoint has no way to know them.
      //
      // Deliberately NOT folded into `message`: that endpoint caps the message
      // at 8,000 characters, so an appendix would turn a long-but-legal enquiry
      // into a validation failure the visitor cannot diagnose.
      if (payload.details) {
        flat.details = JSON.stringify(payload.details);
        flat.detailsText = detailsLines(payload.details).join('\n');
      } else {
        delete flat.details;
      }
      return { body: new w.URLSearchParams(flat).toString(),
               headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                          'Accept': 'application/json', 'X-Requested-With': 'fetch' } };
    }
    return { body: JSON.stringify(payload),
             headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  }

  var ERR = {
    validation: 'Some details need correcting. Please check the highlighted fields.',
    ratelimit:  'That is a few too many enquiries in a short time. Please wait a little and try again.',
    origin:     'That submission could not be verified. Please reload this page and try again.',
    toolarge:   'That message is too long. Please shorten it and try again.',
    method:     'Something went wrong submitting the form. Please try again.',
    server:     'We could not record your inquiry just now. Please try again, or email us directly.'
  };

  function send(form, payload, btn) {
    token().then(function (t) {
      if (t) { payload.recaptchaToken = t; payload.recaptchaAction = ACTION; }
      var wire = encode(payload, form);
      return w.fetch(ENDPOINT, { method: 'POST', body: wire.body, headers: wire.headers,
                               credentials: 'same-origin' });
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'server' }; });
    }).then(function (data) {
      if (data && data.ok) {
        // Only the server can confirm an inquiry was stored, so only now.
        if (CFG.successRedirect) {
          w.location.assign(CFG.successRedirect
            + '?ref=' + encodeURIComponent(data.ref || '')
            + '&purpose=' + encodeURIComponent(data.purpose || payload.subject || 'general'));
          return;
        }
        setStatus(form, 'success',
          'Thank you — your inquiry has been received. We will reply by email.');
        form.reset();
      } else {
        var code = (data && data.error) || 'server';
        setStatus(form, 'error', ERR[code] || ERR.server);
        (data && data.fields || []).forEach(function (f) { fieldErr(form, f, true); });
      }
      btn.disabled = false; btn.removeAttribute('aria-disabled');
    }).catch(function () {
      // Network failure. Never claim success.
      setStatus(form, 'error', ERR.server);
      btn.disabled = false; btn.removeAttribute('aria-disabled');
    });
  }

  // CTAs across these sites deep-link as /contact/?purpose=javacard, so the
  // inquiry type arrives preselected. The value is only ever compared against
  // <option> values already in the DOM — nothing from the URL is written into
  // the page.
  function preselectSubject(form) {
    var sel = form.querySelector('select[name="subject"]');
    if (!sel || !w.URLSearchParams) { return; }
    var q = new w.URLSearchParams(w.location.search);
    var wanted = q.get('purpose') || q.get('subject');
    if (!wanted) { return; }

    // A compound alias — /contact.html?purpose=quote-core-kit — preselects an
    // enquiry type AND one detail. The alias table is a closed set defined in
    // the schema, so the URL can only ever choose a value that already exists:
    // nothing from the query string is written into the page, and every
    // preselection stays editable. The server re-validates regardless (§29.4.2c).
    var alias = SCHEMA && SCHEMA.purposeAliases ? SCHEMA.purposeAliases[wanted] : null;
    if (alias) {
      var legacy = '';
      SCHEMA.inquiryType.options.forEach(function (o) {
        if (o.value === alias.inquiryType) { legacy = o.legacy || o.value; }
      });
      for (var j = 0; j < sel.options.length; j++) {
        if (sel.options[j].value === legacy) { sel.value = legacy; break; }
      }
      syncDetails(form);
      var k;
      for (k in alias.details || {}) {
        if (!Object.prototype.hasOwnProperty.call(alias.details, k)) { continue; }
        var el = form.querySelector('select[name="' + DPREFIX + k + '"]');
        if (!el) { continue; }
        for (var m = 0; m < el.options.length; m++) {
          if (el.options[m].value === alias.details[k]) { el.value = alias.details[k]; break; }
        }
      }
      syncDetails(form);
      return;
    }

    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === wanted) { sel.value = wanted; syncDetails(form); return; }
    }
  }

  function bind(form) {
    // Idempotent: a React page may re-run init on every mount, and binding a
    // second submit listener would send the inquiry twice.
    if (form.getAttribute('data-intake-bound') === '1') { return; }
    form.setAttribute('data-intake-bound', '1');

    // Stamp the timing field if the markup has one (bot-detection signal).
    var tsEl = form.querySelector('[name="ts"]');
    if (tsEl && !tsEl.value) { tsEl.value = String(Math.floor(Date.now() / 1000)); }

    renderDetails(form);
    preselectSubject(form);
    injectConsent(form);
    injectTerms(form);

    CANONICAL.forEach(function (f) {
      var el = form.querySelector('[name="' + f + '"]');
      if (el) { el.addEventListener('input', function () { fieldErr(form, f, false); }, { passive: true }); }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Honeypot: hidden from people and assistive tech, so anything in it is
      // a bot. Stop silently — telling a bot it failed only helps it retry.
      var hp = form.querySelector('[name="website"]');
      if (hp && hp.value.trim() !== '') { return; }

      CANONICAL.forEach(function (f) { fieldErr(form, f, false); });
      if (SCHEMA) {
        (SCHEMA.fields || []).forEach(function (f) { fieldErr(form, DPREFIX + f.key, false); });
      }

      var bad = validate(form);
      if (bad.length) {
        bad.forEach(function (f) { fieldErr(form, f, true); });
        setStatus(form, 'error', ERR.validation);
        var first = form.querySelector('[aria-invalid="true"]');
        if (first) { first.focus(); }
        return;
      }

      var payload = collect(form);
      var btn = form.querySelector('[type="submit"]');

      if (!ENDPOINT) { composeMail(form, payload); return; }

      btn.disabled = true; btn.setAttribute('aria-disabled', 'true');
      setStatus(form, 'busy', 'Sending your inquiry…');
      send(form, payload, btn);
    });
  }

  function init() {
    Array.prototype.forEach.call(d.querySelectorAll('form[data-intake-form]'), bind);
  }

  // Static pages: the form is in the HTML, so binding now is enough. Pages that
  // render the form later (the React tools site) call window.AmbimatIntake.init()
  // after mount; bind() is idempotent so calling it twice is safe.
  w.AmbimatIntake = { init: init };
  if (d.readyState === 'loading') { d.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})(window, document);
