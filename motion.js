/* Scroll motion for the homepage: reveals, stagger, parallax, zoom and 3D tilt.
   Runs only when JS is available and the visitor has not asked for reduced motion. */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) return;

  root.classList.add("js-motion");
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  /* Stagger: children of [data-stagger] reveal one after another. */
  document.querySelectorAll("[data-stagger]").forEach(group => {
    Array.from(group.children).forEach((child, index) => {
      if (!child.hasAttribute("data-reveal")) child.setAttribute("data-reveal", "up");
      child.style.setProperty("--reveal-delay", `${index * 90}ms`);
    });
  });

  /* Topography lines: normalise path length so the draw-in animation is consistent. */
  document.querySelectorAll(".topography path").forEach((path, index) => {
    path.setAttribute("pathLength", "1");
    path.style.setProperty("--i", String(index));
  });

  /* One-shot reveals when an element enters the viewport. */
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll("[data-reveal]").forEach(el => revealObserver.observe(el));

  /* Scroll-driven effects, batched into one animation frame per scroll. */
  const hero = document.querySelector(".hero");
  const heroArt = document.querySelector(".hero-art");
  const heroCopy = document.querySelector(".hero-copy");
  const contours = document.querySelector(".hero-contours");
  const progressBar = document.querySelector(".scroll-progress");
  const parallaxEls = document.querySelectorAll("[data-parallax]");
  const zoomEls = document.querySelectorAll("[data-zoom]");
  const tiltEls = document.querySelectorAll("[data-tilt]");
  const narrow = window.matchMedia("(max-width: 780px)");

  let queued = false;

  function update() {
    queued = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const scrollable = document.documentElement.scrollHeight - vh;

    if (progressBar) progressBar.style.transform = `scaleX(${scrollable > 0 ? (y / scrollable).toFixed(4) : 0})`;

    /* Hero: the art drifts up, tilts into depth and zooms as the visitor scrolls past it. */
    if (hero) {
      const p = clamp(y / (hero.offsetHeight * 0.85), 0, 1);
      if (heroArt) {
        heroArt.style.transform =
          `translate3d(0, ${(-y * 0.08).toFixed(1)}px, 0) rotateX(${(p * 10).toFixed(2)}deg) rotateY(${(-p * 6).toFixed(2)}deg) scale(${(1 + p * 0.14).toFixed(3)})`;
      }
      if (heroCopy) {
        heroCopy.style.transform = `translate3d(0, ${(-y * 0.18).toFixed(1)}px, 0)`;
        heroCopy.style.opacity = (1 - p * 0.75).toFixed(3);
      }
    }

    /* Background contours move at a different rate for layered depth. */
    if (contours) {
      contours.style.transform = `translate3d(0, ${(y * 0.22).toFixed(1)}px, 0) rotate(${(y * 0.02).toFixed(2)}deg)`;
    }

    /* Generic parallax: offset grows with distance from the viewport centre. */
    parallaxEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      const distance = rect.top + rect.height / 2 - vh / 2;
      const speed = parseFloat(el.dataset.parallax) || 0.1;
      el.style.transform = `translate3d(0, ${(-distance * speed).toFixed(1)}px, 0)`;
    });

    /* Zoom: elements grow from small and settle into place as they enter. */
    zoomEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      const progress = clamp((vh - rect.top) / (vh * 0.55), 0, 1);
      el.style.transform = `scale(${(0.35 + 0.65 * progress).toFixed(3)}) rotate(${((1 - progress) * -40).toFixed(1)}deg)`;
    });

    /* 3D tilt: cards fold up from their top edge as they come into view. Skipped on narrow screens. */
    if (!narrow.matches) {
      tiltEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        const progress = clamp((vh - rect.top) / (vh * 0.9), 0, 1);
        el.style.transform = `perspective(1200px) rotateX(${((1 - progress) * 12).toFixed(2)}deg)`;
      });
    }
  }

  function requestUpdate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();

  /* Let the hero lines draw in once the first frame has painted. */
  requestAnimationFrame(() => window.setTimeout(() => root.classList.add("is-loaded"), 120));
})();
