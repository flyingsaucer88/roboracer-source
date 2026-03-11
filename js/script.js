/* =========================================================
   SIMSECURE — SCRIPT.JS
   Vanilla JS — no external dependencies
   ========================================================= */

'use strict';

/* =========================================================
   1. HAMBURGER / MOBILE MENU
   ========================================================= */
(function initMobileMenu() {
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const menuClose  = document.getElementById('menuClose');
  const menuLinks  = mobileMenu ? mobileMenu.querySelectorAll('a') : [];

  if (!hamburger || !mobileMenu) return;

  function openMenu() {
    mobileMenu.classList.add('is-open');
    hamburger.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    mobileMenu.classList.remove('is-open');
    hamburger.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', function () {
    if (mobileMenu.classList.contains('is-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  if (menuClose) menuClose.addEventListener('click', closeMenu);

  // Close on link click
  menuLinks.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
      closeMenu();
    }
  });
})();


/* =========================================================
   2. SCROLL FADE-IN ROWS (IntersectionObserver)
   ========================================================= */
(function initScrollAnimations() {
  var rows = document.querySelectorAll('.fade-row');
  if (!rows.length) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  rows.forEach(function (row) {
    observer.observe(row);
  });
})();


/* =========================================================
   3. HERO CODE PANEL — Typewriter animation
   ========================================================= */
(function initCodeAnimation() {
  var codeEl = document.querySelector('#codeBlock code');
  if (!codeEl) return;

  // The Java code content with HTML spans for syntax highlighting
  var codeLines = [
    '<span class="tok-at">@Service</span>',
    '<span class="tok-kw">public class</span> <span class="tok-type">SATAuthService</span> {',
    '',
    '  <span class="tok-at">@Autowired</span>',
    '  <span class="tok-kw">private</span> <span class="tok-type">SIMSecureClient</span> client;',
    '',
    '  <span class="tok-kw">public</span> <span class="tok-type">AuthResult</span> <span class="tok-fn">authenticate</span>(',
    '      <span class="tok-type">String</span> msisdn,',
    '      <span class="tok-type">AuthContext</span> ctx) {',
    '',
    '    <span class="tok-cmt">// Build auth request with SAT token</span>',
    '    <span class="tok-type">SATRequest</span> req = <span class="tok-type">SATRequest</span>.builder()',
    '      .msisdn(msisdn)',
    '      .nonce(ctx.getNonce())',
    '      .challenge(ctx.getChallenge())',
    '      .consentRef(ctx.getConsent())',
    '      .build();',
    '',
    '    <span class="tok-cmt">// Execute SAT authentication</span>',
    '    <span class="tok-type">SATResponse</span> resp = client',
    '      .satAuthenticate(req);',
    '',
    '    <span class="tok-kw">if</span> (resp.getStatus() == <span class="tok-num">0x9000</span>) {',
    '      <span class="tok-kw">return</span> <span class="tok-type">AuthResult</span>.success(',
    '        resp.getIdentityToken(),',
    '        resp.getTrustScore()',
    '      );',
    '    }',
    '',
    '    <span class="tok-kw">return</span> <span class="tok-type">AuthResult</span>.failure(',
    '      resp.getStatus(),',
    '      resp.getReason()',
    '    );',
    '  }',
    '}',
  ];

  var rendered = '';
  var lineIndex = 0;
  var charIndex = 0;
  var isTyping = true;
  var typeSpeed = 18;   // ms per character
  var lineDelay = 60;   // extra ms after each line
  var startDelay = 600; // ms before typing begins

  // Strip HTML tags for character-level typing, then re-apply
  // We'll type line by line with a fast reveal per line
  function revealLines() {
    if (lineIndex >= codeLines.length) return;

    var line = codeLines[lineIndex];
    rendered += line + '\n';
    codeEl.innerHTML = rendered;
    // Auto-scroll code block
    var pre = codeEl.closest('.code-block');
    if (pre) pre.scrollTop = pre.scrollHeight;

    lineIndex++;
    var delay = lineDelay + (line.replace(/<[^>]*>/g, '').length * 6);
    setTimeout(revealLines, Math.min(delay, 180));
  }

  setTimeout(revealLines, startDelay);
})();


/* =========================================================
   4. HERO LOG PANEL — Sequential entry reveal
   ========================================================= */
(function initLogAnimation() {
  var logContainer = document.getElementById('logEntries');
  if (!logContainer) return;

  var entries = [
    { time: '08:42:01.112', level: 'INFO',  msg: 'SAT session initialised · MSISDN +447911123456' },
    { time: '08:42:01.203', level: 'DEBUG', msg: 'Challenge nonce generated · <span class="log-tag">a3f8e21c</span>' },
    { time: '08:42:01.387', level: 'INFO',  msg: 'Applet command dispatched · CLA=80 INS=A4' },
    { time: '08:42:01.481', level: 'DEBUG', msg: 'SIM response received · 28 bytes' },
    { time: '08:42:01.502', level: 'INFO',  msg: 'SAT token parsed · binding OK' },
    { time: '08:42:01.618', level: 'INFO',  msg: 'Consent reference verified · <span class="log-tag">cns_8821a</span>' },
    { time: '08:42:01.709', level: 'INFO',  msg: 'SIM Swap check passed · last swap >90d' },
    { time: '08:42:01.820', level: 'INFO',  msg: 'Trust score computed · <span class="log-tag">0.94</span> / 1.00' },
    { time: '08:42:01.911', level: 'INFO',  msg: 'Identity token issued · exp 3600s' },
    { time: '08:42:01.948', level: 'OK',    msg: 'SW 9000 · <span class="log-tag">AUTHENTICATED</span>' },
  ];

  var levelMap = {
    'INFO':  'info',
    'DEBUG': 'debug',
    'OK':    'ok',
    'WARN':  'warn',
  };

  function addEntry(entry) {
    var el = document.createElement('div');
    el.className = 'log-entry';

    var levelClass = levelMap[entry.level] || 'info';

    el.innerHTML = [
      '<span class="log-time">' + entry.time + '</span>',
      '<span class="log-level ' + levelClass + '">' + entry.level + '</span>',
      '<span class="log-msg">' + entry.msg + '</span>',
    ].join('');

    logContainer.appendChild(el);

    // Trigger animation on next frame
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add('visible');
      });
    });

    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // Start with a delay, then add entries sequentially
  var startDelay = 1200;
  var entryDelay = 340; // ms between entries

  setTimeout(function () {
    var i = 0;
    function next() {
      if (i >= entries.length) {
        // Replay after a pause
        setTimeout(function () {
          logContainer.innerHTML = '';
          i = 0;
          next();
        }, 4000);
        return;
      }
      addEntry(entries[i]);
      i++;
      setTimeout(next, entryDelay);
    }
    next();
  }, startDelay);
})();


/* =========================================================
   5. NAV SCROLL SHADOW
   ========================================================= */
(function initNavScroll() {
  var nav = document.getElementById('nav');
  if (!nav) return;

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        if (window.scrollY > 10) {
          nav.style.boxShadow = '0 1px 16px rgba(17,17,17,0.08)';
        } else {
          nav.style.boxShadow = '';
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();


/* =========================================================
   6. ACTIVE NAV LINK HIGHLIGHT (scroll spy)
   ========================================================= */
(function initScrollSpy() {
  var navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  if (!navLinks.length) return;

  var sections = Array.from(navLinks).map(function (link) {
    var id = link.getAttribute('href').replace('#', '');
    return {
      link: link,
      el: document.getElementById(id),
    };
  }).filter(function (item) { return item.el; });

  var ticking = false;

  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        var scrollY = window.scrollY + 80;
        var current = null;
        sections.forEach(function (item) {
          if (item.el.offsetTop <= scrollY) {
            current = item;
          }
        });
        navLinks.forEach(function (link) {
          link.style.color = '';
          link.style.fontWeight = '';
        });
        if (current) {
          current.link.style.color = 'var(--black)';
          current.link.style.fontWeight = '600';
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();
