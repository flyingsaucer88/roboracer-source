/* RoboRacer — global navigation behaviour.
 *
 * Replaces the previous inline `onclick="toggleMenu()"` handlers that were
 * duplicated across index/resource and missing entirely from contact.
 *
 * Responsibilities:
 *   - toggle the mobile menu and keep aria-expanded truthful
 *   - close on Escape, on outside click, and on link activation
 *   - return focus to the toggle when the menu closes via Escape
 *   - mark the current page's nav link with aria-current="page"
 *
 * No focus trap is installed: the menu is an inline disclosure rendered in
 * DOM order directly after the toggle, so Tab continues naturally into the
 * links and then out to the rest of the page.
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var toggle = document.querySelector(".hamburger");
    var menu = document.querySelector(".nav-links");

    if (toggle && menu) {
      var setOpen = function (open) {
        menu.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      };

      toggle.addEventListener("click", function (event) {
        event.stopPropagation();
        setOpen(toggle.getAttribute("aria-expanded") !== "true");
      });

      menu.addEventListener("click", function (event) {
        if (event.target.closest("a")) setOpen(false);
      });

      document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        if (toggle.getAttribute("aria-expanded") !== "true") return;
        setOpen(false);
        toggle.focus();
      });

      document.addEventListener("click", function (event) {
        if (toggle.getAttribute("aria-expanded") !== "true") return;
        if (menu.contains(event.target) || toggle.contains(event.target)) return;
        setOpen(false);
      });

      // A resize past the desktop breakpoint hides .nav-links entirely; clear
      // the open state so aria-expanded does not claim an invisible menu.
      window.addEventListener("resize", function () {
        if (window.innerWidth > 880) setOpen(false);
      });
    }

    // Mark the active page. Pages are flat .html files at the site root, so
    // comparing the final path segment is sufficient. "" and "index.html"
    // are the same page.
    //
    // Links carrying a fragment (/#parts, /#services) are skipped even when
    // they point at the current document: they navigate to a section, not to
    // the page, and aria-current="page" must identify exactly one target.
    var current = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href.indexOf("http") === 0 || href.indexOf("#") !== -1) return;
      var target = href.split("/").pop() || "index.html";
      if (target === current) link.setAttribute("aria-current", "page");
    });
  });
})();
