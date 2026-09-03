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

  function collect(form) {
    var payload = {}, extra = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'submit') { return; }
      if (el.name === 'website' || el.name === 'ts') { return; }  // handled separately
      // Consent is not an inquiry field: it is carried in its own object with
      // its own evidence, never folded into `extra`.
      if (el.name === 'productUpdatesConsent' || el.name === 'jobAlertsConsent') { return; }
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

    var consent = consentPayload(form);
    if (consent) { payload.consent = consent; }
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
    CANONICAL.forEach(function (k) { if (payload[k]) { lines.push(LABEL[k] + ': ' + payload[k]); } });
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
    lines.push('', '— sent from ' + payload.sourceUrl);

    var subject = payload.subject
      ? (CFG.subjectPrefix || 'Website enquiry') + ' (' + payload.subject + ')'
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
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === wanted) { sel.value = wanted; return; }
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

    preselectSubject(form);
    injectConsent(form);

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
