/**
 * Ensures Sign Up / Get Started links always resolve to signup.html
 * (works regardless of folder URL, e.g. /WEBSITE%20KP/ or localhost root).
 */
(function () {
  function signupUrl() {
    return new URL("signup.html", window.location.href).href;
  }

  function isSignupLink(el) {
    if (!el || el.tagName !== "A") return false;

    const href = (el.getAttribute("href") || "").toLowerCase();
    if (href.includes("signup.html")) return true;
    if (el.classList.contains("contact-btn")) return true;
    if (el.classList.contains("signup-btn-mobile")) return true;
    if (el.classList.contains("expertise-btn")) return true;

    const text = (el.textContent || "").trim().toLowerCase();
    if (
      el.classList.contains("btn-primary") &&
      (text.includes("get started") || text.includes("build your strategy"))
    ) {
      return true;
    }

    return false;
  }

  function fixSignupLinks() {
    const url = signupUrl();

    document.querySelectorAll("a").forEach(function (anchor) {
      if (!isSignupLink(anchor)) return;

      anchor.setAttribute("href", url);

      anchor.addEventListener("click", function (event) {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const target = anchor.getAttribute("target");
        if (target && target !== "_self") return;

        event.preventDefault();
        window.location.assign(url);
      });
    });
  }

  // ── Logo redirect for logged-in users ──────────────────────────────────
  // auth-utils.js writes "dwp:session" = "1" to localStorage whenever a user
  // is signed in (via onAuthStateChanged) and removes it on sign-out.  This
  // flag is readable on any page — even those that don't load the Firebase SDK
  // — so we can redirect the logo click without adding Firebase to every page.
  // (Firebase v9+ uses IndexedDB, not localStorage, so checking the old
  //  "firebase:authUser:" keys is unreliable on modern Firebase versions.)
  function hasSession() {
    try {
      return localStorage.getItem("dwp:session") === "1";
    } catch (e) {
      return false;
    }
  }

  function fixLogoLink() {
    const logo = document.querySelector("a.logo");
    if (!logo) return;

    const dashUrl = new URL("dashboard.html", window.location.href).href;

    // Update href immediately so hover tooltip and right-click show the right URL
    if (hasSession()) logo.href = dashUrl;

    // Intercept click at runtime for an authoritative check
    logo.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = logo.getAttribute("target");
      if (target && target !== "_self") return;
      if (hasSession()) {
        e.preventDefault();
        window.location.assign(dashUrl);
      }
    });
  }
  // ────────────────────────────────────────────────────────────────────────

  function init() {
    fixSignupLinks();
    fixLogoLink();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
