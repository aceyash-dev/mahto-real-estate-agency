/* Homepage motion, three libraries with separate jobs:
   - Lenis: smooth scrolling for the whole page.
   - Motion (motion.dev): scroll-linked 3D (hero, terrain stage, parallax, tilt) and reveals.
   - anime.js: per-character 3D headline reveals.
   Runs only when JS is available and the visitor has not asked for reduced motion.
   Ownership rule: an element is driven by one library at a time, so transforms never fight. */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches || !window.Lenis || !window.Motion || !window.anime) return;

  const root = document.documentElement;
  root.classList.add("js-motion");

  const { animate, inView, scroll, stagger } = window.Motion;
  const anime = window.anime;
  const EASE = [0.2, 0.7, 0.2, 1];
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
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
    if (id === "top") { event.preventDefault(); lenis.scrollTo(0); return; }
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, { offset: -84 });
    history.replaceState(null, "", `#${id}`);
  });

  /* Scroll progress bar. */
  const progressBar = document.querySelector(".scroll-progress");
  if (progressBar) scroll(animate(progressBar, { scaleX: [0, 1] }, { ease: "linear" }));

  /* Hero headline: words rise from a clip mask. */
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

  /* Per-character split for anime.js 3D flips. Spaces are kept so wrapping still works. */
  function splitChars(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { fragment.append(part); return; }
        /* Each word stays unbroken, so a line never ends mid-word. */
        const word = document.createElement("span");
        word.className = "word-chars";
        Array.from(part).forEach(char => {
          const span = document.createElement("span");
          span.className = "char";
          span.textContent = char;
          word.append(span);
        });
        fragment.append(word);
      });
      node.replaceWith(fragment);
    });
    return element.querySelectorAll(".char");
  }

  const hero = document.querySelector(".hero");
  const heroCopy = document.querySelector(".hero-copy");
  const heroArt = document.querySelector(".hero-art");
  const artFrame = document.querySelector(".art-frame");
  const headline = document.querySelector(".hero h1");

  /* Hero intro. */
  if (headline) {
    const words = splitWords(headline);
    animate(words, { y: ["110%", "0%"] }, { duration: 1.15, delay: stagger(0.06, { start: 0.2 }), ease: EASE });
  }
  if (heroCopy) {
    const supporting = heroCopy.querySelectorAll(":scope > :not(h1)");
    animate(supporting, { opacity: [0, 1], y: [24, 0] }, { duration: 1, delay: stagger(0.12, { start: 0.7 }), ease: EASE });
  }
  if (artFrame) animate(artFrame, { opacity: [0, 1], scale: [0.92, 1] }, { duration: 1.6, delay: 0.3, ease: EASE });

  /* Hero scroll-linked 3D: the artwork tilts back into depth and zooms as it leaves the screen. */
  if (hero && heroArt) {
    scroll(
      animate(heroArt, { y: [0, -70], rotateX: [0, 14], rotateY: [0, -8], scale: [1, 1.16] }, { ease: "linear" }),
      { target: hero, offset: ["start start", "end start"] }
    );
  }
  if (hero && heroCopy) {
    scroll(animate(heroCopy, { y: [0, -90], opacity: [1, 0.2] }, { ease: "linear" }), { target: hero, offset: ["start start", "end start"] });
  }
  const contours = document.querySelector(".hero-contours");
  if (hero && contours) {
    scroll(animate(contours, { y: [0, 220], rotate: [0, 8] }, { ease: "linear" }), { target: hero, offset: ["start start", "end start"] });
  }

  /* Pointer 3D: the artwork leans toward the cursor. Pointer devices only. */
  if (artFrame && finePointer.matches) {
    const frameWrap = artFrame.parentElement;
    frameWrap.addEventListener("pointermove", event => {
      const rect = artFrame.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width;
      const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height;
      animate(artFrame, { rotateX: -dy * 9, rotateY: dx * 12 }, { duration: 0.6, ease: "easeOut" });
    });
    frameWrap.addEventListener("pointerleave", () => {
      animate(artFrame, { rotateX: 0, rotateY: 0 }, { duration: 0.9, ease: EASE });
    });
  }

  /* Terrain stage: the process section's layered contour map explodes apart as you scroll
     through the steps, and each step lights up its layer. */
  const track = document.querySelector(".process-list");
  const stack = document.querySelector(".terrain-stack");
  if (track && stack && wide.matches) {
    const COUNT = 5;
    const loop = (seed, radius, wobble) => {
      let d = "";
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        const r = radius + Math.sin(3 * t + seed) * wobble + Math.sin(5 * t + seed * 1.7) * wobble * 0.5 + Math.cos(2 * t + seed * 0.6) * wobble * 0.8;
        const x = 200 + Math.cos(t) * r * 1.15;
        const y = 200 + Math.sin(t) * r;
        d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return `${d}Z`;
    };
    const layers = [];
    for (let k = 0; k < COUNT; k++) {
      const seed = k * 1.37 + 0.4;
      let contours = "";
      for (let j = 0; j < 6; j++) contours += `<path d="${loop(seed + j * 0.8, 146 - j * 22, 8 + j * 0.6)}"/>`;
      const layer = document.createElement("div");
      layer.className = "terrain-layer";
      layer.innerHTML = `<svg viewBox="0 0 400 400" aria-hidden="true"><path class="slab" d="${loop(seed, 150, 6)}"/>${contours}</svg>`;
      stack.append(layer);
      layers.push(layer);
    }
    const labels = Array.from(document.querySelectorAll(".terrain-labels li"));
    let activeIndex = -1;

    scroll(progress => {
      const p = clamp(progress, 0, 1);
      const spread = 14 + p * 150;
      stack.style.transform = `rotateX(${(64 - p * 26).toFixed(2)}deg) rotateZ(${(-24 + p * 12).toFixed(2)}deg)`;
      const idx = Math.min(COUNT - 1, Math.floor(p * COUNT));
      layers.forEach((layer, k) => {
        const offset = k - (COUNT - 1) / 2;
        layer.style.transform = `translate3d(${(offset * p * 22).toFixed(1)}px, 0, ${(offset * spread).toFixed(1)}px)`;
        layer.style.opacity = k <= idx ? "1" : "0.25";
      });
      if (idx !== activeIndex) {
        activeIndex = idx;
        labels.forEach((label, i) => label.classList.toggle("is-active", i === idx));
      }
    }, { target: track, offset: ["start 65%", "end 60%"] });
  }

  /* Headlines: each character flips in on its own axis, using anime.js. */
  document.querySelectorAll("[data-chars]").forEach(heading => {
    const chars = splitChars(heading);
    inView(heading, () => {
      anime.animate(chars, {
        opacity: [0, 1],
        rotateX: [-110, 0],
        translateY: ["0.4em", "0em"],
        duration: 900,
        delay: anime.stagger(24),
        ease: "outExpo"
      });
    }, { amount: 0.5 });
  });

  /* Reveals: [data-reveal] elements animate in once, when they enter the viewport. */
  const variants = {
    up: { y: [48, 0] },
    left: { x: [-60, 0] },
    right: { x: [60, 0] },
    zoom: { scale: [0.88, 1] }
  };
  const reveal = (element, delay = 0) => {
    const variant = variants[element.dataset.reveal] || variants.up;
    animate(element, { opacity: [0, 1], ...variant }, { duration: 1.05, delay, ease: EASE });
  };

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

  /* Topography lines draw in on load. */
  document.querySelectorAll(".topography path").forEach((path, index) => {
    path.setAttribute("pathLength", "1");
    path.style.setProperty("--i", String(index));
  });
  requestAnimationFrame(() => window.setTimeout(() => root.classList.add("is-loaded"), 120));

  /* Parallax: elements drift at their own speed. */
  document.querySelectorAll("[data-parallax]").forEach(element => {
    const speed = parseFloat(element.dataset.parallax) || 0.1;
    scroll(animate(element, { y: [-speed * 320, speed * 320] }, { ease: "linear" }), { target: element, offset: ["start end", "end start"] });
  });

  /* Zoom: the monogram grows from small and rotates into place. */
  document.querySelectorAll("[data-zoom]").forEach(element => {
    scroll(animate(element, { scale: [0.35, 1], rotate: [-40, 0] }, { ease: "linear" }), { target: element, offset: ["start end", "center center"] });
  });

  /* 3D tilt: pathway cards fold up from their top edge as they come into view. Desktop only. */
  document.querySelectorAll("[data-tilt]").forEach(element => {
    if (!wide.matches) return;
    scroll(animate(element, { rotateX: [14, 0] }, { ease: "linear" }), { target: element, offset: ["start end", "center center"] });
  });

  /* Walkthrough: a house built from 3D planes, entered on scroll.
     One progress value (0 to 1) drives four stages:
       01 Plan   the floor plan lies flat
       02 Raise  the walls fold up from the floor edges
       03 Enter  the front wall swings open and the camera passes through the door
       04 Rooms  the room cards float in, facing the viewer */
  const walk = document.querySelector(".walk");
  const walkHouse = document.querySelector(".walk .house");
  if (walk && walkHouse && wide.matches) {
    const H = 300;
    const walls = {
      back: document.querySelector(".wall-back"),
      left: document.querySelector(".wall-left"),
      right: document.querySelector(".wall-right"),
      front: document.querySelector(".wall-front")
    };
    const floor = document.querySelector(".walk .floor");
    const cards = Array.from(document.querySelectorAll(".walk .room-card"));
    /* Card slots inside the room, in house space: a 2x2 grid floating above the floor. */
    const slots = [[-190, -150], [190, -150], [-190, 150], [190, 150]];
    const steps = Array.from(document.querySelectorAll(".walk-steps li"));
    const clamp01 = v => Math.min(Math.max(v, 0), 1);
    const range = (p, a, b) => clamp01((p - a) / (b - a));
    const ease = t => t * t * (3 - 2 * t);
    const lerpStep = (p, a, b) => ease(range(p, a, b));

    /* Hinge each wall to a floor edge; fold angle 0 lies flat, 90 stands upright. */
    if (walls.back) walls.back.style.transformOrigin = "50% 100%";
    if (walls.left) walls.left.style.transformOrigin = "100% 50%";
    if (walls.right) walls.right.style.transformOrigin = "0% 50%";
    if (walls.front) walls.front.style.transformOrigin = "50% 0%";
    if (walls.back) walls.back.style.transform = `translate3d(0, ${-2 * H}px, 0) rotateX(0deg)`;
    if (walls.left) walls.left.style.transform = `translate3d(${-2 * H}px, 0, 0) rotateY(0deg)`;
    if (walls.right) walls.right.style.transform = `translate3d(${2 * H}px, 0, 0) rotateY(0deg)`;
    if (walls.front) walls.front.style.transform = `translate3d(0, ${2 * H}px, 0) rotateX(0deg)`;

    function renderWalk(p) {
      const raise = lerpStep(p, 0.16, 0.42);
      const enter = lerpStep(p, 0.42, 0.62);
      const houseRx = 56 * raise;
      const houseRz = -18 * raise;
      const houseS = 1 + 0.22 * enter;
      const houseZ = 280 * enter;
      walkHouse.style.transform =
        `translate3d(${(290 * raise).toFixed(1)}px, ${(90 * raise).toFixed(1)}px, ${houseZ.toFixed(1)}px) rotateX(${houseRx.toFixed(2)}deg) rotateZ(${houseRz.toFixed(2)}deg) scale(${houseS.toFixed(3)})`;

      if (walls.back) walls.back.style.transform = `translate3d(0, ${-2 * H}px, 0) rotateX(${(-90 * raise).toFixed(2)}deg)`;
      if (walls.left) walls.left.style.transform = `translate3d(${-2 * H}px, 0, 0) rotateY(${(90 * raise).toFixed(2)}deg)`;
      if (walls.right) walls.right.style.transform = `translate3d(${2 * H}px, 0, 0) rotateY(${(-90 * raise).toFixed(2)}deg)`;
      /* The front wall stays flat as a threshold while the house rises, then swings open to let the camera through. */
      if (walls.front) {
        walls.front.style.transform = `translate3d(0, ${2 * H}px, 0) rotateX(${(90 * enter).toFixed(2)}deg)`;
        walls.front.style.opacity = (1 - lerpStep(p, 0.56, 0.66)).toFixed(3);
      }

      if (floor) floor.style.opacity = (1 - 0.35 * enter).toFixed(3);

      cards.forEach((card, i) => {
        const start = 0.6 + i * 0.07;
        const c = lerpStep(p, start, start + 0.2);
        const [x, y] = slots[i] || [0, 0];
        const z = 220 - (1 - c) * 260;
        card.style.opacity = c.toFixed(3);
        /* Counter-rotate so each card faces the viewer while the house tilts around it. */
        card.style.transform =
          `translate3d(-50%, -50%, 0) translate3d(${x}px, ${y}px, ${z.toFixed(1)}px) rotateZ(${(-houseRz).toFixed(2)}deg) rotateX(${(-houseRx).toFixed(2)}deg)`;
      });

      const idx = p < 0.16 ? 0 : p < 0.42 ? 1 : p < 0.6 ? 2 : 3;
      steps.forEach((li, i) => li.classList.toggle("is-active", i === idx));
    }

    scroll(renderWalk, { target: walk, offset: ["start start", "end end"] });
    renderWalk(0);
  }

  /* Magnetic primary buttons. Pointer devices only. */
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
