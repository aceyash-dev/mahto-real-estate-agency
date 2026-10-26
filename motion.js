/* Homepage motion: Lenis smooth scrolling + Motion (motion.dev) for reveals,
   scroll-linked parallax, zoom and 3D tilt, and a kinetic hero intro.
   Runs only when JS is available and the visitor has not asked for reduced motion.
   Ownership rule: an element is either scroll-linked or revealed, never both. */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches || !window.Lenis || !window.Motion) return;

  const root = document.documentElement;
  root.classList.add("js-motion");

  const { animate, inView, scroll, stagger } = window.Motion;
  const EASE = [0.2, 0.7, 0.2, 1];
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const wide = window.matchMedia("(min-width: 781px)");

  /* Smooth scrolling. Lenis drives native scroll, so Motion's scroll() keeps working. */
  const lenis = new window.Lenis({
    duration: 1.2,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.2
  });
  const raf = time => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);

  /* In-page anchors go through Lenis so they land below the sticky header. */
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href").slice(1);
    if (!id) return;
    if (id === "top") {
      event.preventDefault();
      lenis.scrollTo(0);
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, { offset: -84 });
    history.replaceState(null, "", `#${id}`);
  });

  /* Scroll progress bar, linked to page scroll. */
  const progressBar = document.querySelector(".scroll-progress");
  if (progressBar) scroll(animate(progressBar, { scaleX: [0, 1] }, { ease: "linear" }));

  /* Split the hero headline into words so each one rises into place. */
  function splitWords(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { fragment.append(part); return; }
        const word = document.createElement("span");
        word.className = "word";
        const inner = document.createElement("span");
        inner.className = "word-inner";
        inner.textContent = part;
        word.append(inner);
        fragment.append(word);
      });
      node.replaceWith(fragment);
    });
    return element.querySelectorAll(".word-inner");
  }

  /* Hero intro: headline words rise, then supporting copy and the artwork settle in. */
  const hero = document.querySelector(".hero");
  const heroCopy = document.querySelector(".hero-copy");
  const heroArt = document.querySelector(".hero-art");
  const artFrame = document.querySelector(".art-frame");
  const headline = document.querySelector(".hero h1");

  if (headline) {
    const words = splitWords(headline);
    animate(words, { y: ["110%", "0%"] }, { duration: 1.15, delay: stagger(0.06, { start: 0.2 }), ease: EASE });
  }
  if (heroCopy) {
    const supporting = heroCopy.querySelectorAll(":scope > :not(h1)");
    animate(supporting, { opacity: [0, 1], y: [24, 0] }, { duration: 1, delay: stagger(0.12, { start: 0.7 }), ease: EASE });
  }
  if (artFrame) animate(artFrame, { opacity: [0, 1], scale: [0.92, 1] }, { duration: 1.6, delay: 0.3, ease: EASE });

  /* Scroll-linked hero: the artwork drifts, tilts into depth and zooms as it leaves the screen. */
  if (hero && heroArt) {
    scroll(
      animate(heroArt, { y: [0, -70], rotateX: [0, 10], rotateY: [0, -6], scale: [1, 1.14] }, { ease: "linear" }),
      { target: hero, offset: ["start start", "end start"] }
    );
  }
  if (hero && heroCopy) {
    scroll(
      animate(heroCopy, { y: [0, -90], opacity: [1, 0.2] }, { ease: "linear" }),
      { target: hero, offset: ["start start", "end start"] }
    );
  }
  const contours = document.querySelector(".hero-contours");
  if (hero && contours) {
    scroll(
      animate(contours, { y: [0, 220], rotate: [0, 6] }, { ease: "linear" }),
      { target: hero, offset: ["start start", "end start"] }
    );
  }

  /* Reveals: [data-reveal] elements animate in once, when they enter the viewport.
     Children of [data-stagger] groups are revealed in sequence. */
  const variants = {
    up: { y: [48, 0] },
    left: { x: [-60, 0] },
    right: { x: [60, 0] },
    zoom: { scale: [0.88, 1] }
  };

  function reveal(element, delay = 0) {
    const variant = variants[element.dataset.reveal] || variants.up;
    animate(element, { opacity: [0, 1], ...variant }, { duration: 1.05, delay, ease: EASE });
  }

  document.querySelectorAll("[data-stagger]").forEach(group => {
    const children = Array.from(group.children);
    children.forEach(child => {
      if (!child.hasAttribute("data-reveal")) child.setAttribute("data-reveal", "up");
    });
    if (group.closest(".hero")) return;
    inView(group, () => children.forEach((child, index) => reveal(child, index * 0.09)), { amount: 0.12 });
  });

  document.querySelectorAll("[data-reveal]").forEach(element => {
    if (element.closest("[data-stagger]")) return;
    inView(element, () => reveal(element), { amount: 0.15 });
  });

  /* Topography lines draw in on load. The stroke animation itself lives in motion.css. */
  document.querySelectorAll(".topography path").forEach((path, index) => {
    path.setAttribute("pathLength", "1");
    path.style.setProperty("--i", String(index));
  });
  requestAnimationFrame(() => window.setTimeout(() => root.classList.add("is-loaded"), 120));

  /* Parallax: elements drift at their own speed relative to the page. */
  document.querySelectorAll("[data-parallax]").forEach(element => {
    const speed = parseFloat(element.dataset.parallax) || 0.1;
    scroll(
      animate(element, { y: [-speed * 320, speed * 320] }, { ease: "linear" }),
      { target: element, offset: ["start end", "end start"] }
    );
  });

  /* Zoom: the monogram grows from small and rotates into place. */
  document.querySelectorAll("[data-zoom]").forEach(element => {
    scroll(
      animate(element, { scale: [0.35, 1], rotate: [-40, 0] }, { ease: "linear" }),
      { target: element, offset: ["start end", "center center"] }
    );
  });

  /* 3D tilt: pathway cards fold up from their top edge as they come into view. Desktop only. */
  document.querySelectorAll("[data-tilt]").forEach(element => {
    if (!wide.matches) return;
    scroll(
      animate(element, { rotateX: [14, 0] }, { ease: "linear" }),
      { target: element, offset: ["start end", "center center"] }
    );
  });

  /* Magnetic primary buttons: they lean slightly toward the pointer. Pointer devices only. */
  if (finePointer.matches) {
    document.querySelectorAll(".button-primary").forEach(button => {
      button.addEventListener("pointermove", event => {
        const rect = button.getBoundingClientRect();
        const x = (event.clientX - (rect.left + rect.width / 2)) * 0.22;
        const y = (event.clientY - (rect.top + rect.height / 2)) * 0.3;
        animate(button, { x, y }, { duration: 0.35, ease: "easeOut" });
      });
      button.addEventListener("pointerleave", () => {
        animate(button, { x: 0, y: 0 }, { duration: 0.6, ease: EASE });
      });
    });
  }
})();
