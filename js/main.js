(function () {
  const header = document.getElementById("header");
  const mobileBtn = document.querySelector(".mobile-menu-btn");
  const nav = document.getElementById("main-nav");
  const overlay = document.getElementById("mobile-overlay");
  function closeMobileMenu() {
    if (!nav) return;
    nav.classList.remove("open");
    overlay?.classList.remove("active");
    overlay?.setAttribute("hidden", "");
    mobileBtn?.setAttribute("aria-expanded", "false");
  }

  function openMobileMenu() {
    if (!nav) return;
    nav.classList.add("open");
    overlay?.classList.add("active");
    overlay?.removeAttribute("hidden");
    mobileBtn?.setAttribute("aria-expanded", "true");
  }

  if (header) {
    const onScroll = () => {
      const scrollY = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const innerHeight = window.innerHeight;

      header.classList.toggle("header-scrolled", scrollY > 50);
      header.classList.toggle(
        "header-hidden",
        scrollY + innerHeight >= scrollHeight - 5
      );
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  if (mobileBtn && nav) {
    mobileBtn.addEventListener("click", () => {
      if (nav.classList.contains("open")) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });
  }

  overlay?.addEventListener("click", closeMobileMenu);

  nav?.querySelectorAll(".nav-item").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 768) closeMobileMenu();
    });
  });

  const currentPath =
    window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-item").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    const isActive =
      href === currentPath ||
      (currentPath === "index.html" && (href === "/" || href === "index.html"));
    link.classList.toggle("active", isActive);
  });
})();
