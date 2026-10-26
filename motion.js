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

  const hero = document.querySelector(".cinematic-hero");
  const heroCopy = document.querySelector(".cinematic-copy");
  const house = document.querySelector(".house-world");
  const houseParts = document.querySelectorAll(".house-volume, .house-tree, .approach-path");
  const headline = document.querySelector(".cinematic-copy h1");

  if (headline) {
    const words = splitWords(headline);
    animate(words, { y: ["115%", "0%"], opacity: [0.2, 1], rotateX: [18, 0] }, { duration: 1.2, delay: stagger(0.1, { start: 0.18 }), ease: EASE });
  }
  if (heroCopy) {
    const supporting = heroCopy.querySelectorAll(":scope > :not(h1):not(.cinematic-bottom)");
    animate(supporting, { opacity: [0, 1], y: [22, 0] }, { duration: 1, delay: stagger(0.1, { start: 0.55 }), ease: EASE });
  }

  /* Scroll is the camera: landscape recedes, the house approaches, and the doorway becomes the next scene. */
  if (hero && house) {
    scroll(progress => {
      const p = clamp(progress, 0, 1);
      const scale = 1 + p * 1.75;
      house.style.setProperty("--house-scale", scale.toFixed(3));
      house.style.setProperty("--house-rx", `${(-p * 7).toFixed(2)}deg`);
      house.style.setProperty("--house-ry", `${(-8 + p * 8).toFixed(2)}deg`);
      house.style.top = `${51 - p * 7}%`;
      house.style.opacity = String(1 - Math.max(0, (p - .82) / .18) * .9);
      const sky = document.querySelector(".cinematic-sky");
      const ridge1 = document.querySelector(".ridge-one");
      const ridge2 = document.querySelector(".ridge-two");
      const fieldBack = document.querySelector(".field-back");
      const fieldFront = document.querySelector(".field-front");
      if (sky) sky.style.transform = `scale(${(1.08 + p * .22).toFixed(3)}) translateY(${(-p * 5).toFixed(2)}%)`;
      if (ridge1) ridge1.style.transform = `translate3d(0,${(-p * 38).toFixed(1)}px,0) scale(${(1 + p * .14).toFixed(3)})`;
      if (ridge2) ridge2.style.transform = `translate3d(0,${(-p * 65).toFixed(1)}px,0) scale(${(1 + p * .22).toFixed(3)})`;
      if (fieldBack) fieldBack.style.transform = `perspective(800px) rotateX(${(p * 8).toFixed(2)}deg) translateY(${p * 45}px) scale(${(1 + p * .32).toFixed(3)})`;
      if (fieldFront) fieldFront.style.transform = `perspective(600px) rotateX(${(p * 14).toFixed(2)}deg) translateY(${p * 95}px) scale(${(1 + p * .65).toFixed(3)})`;
      houseParts.forEach((part, i) => { part.style.setProperty("--depth-shift", `${p * (i + 1) * 1.8}px`); });
      if (heroCopy) {
        heroCopy.style.opacity = String(1 - Math.max(0, (p - .2) / .62) * .9);
        heroCopy.style.transform = `translate3d(0,${(-p * 75).toFixed(1)}px,0)`;
      }
      const overlay = document.querySelector(".cinematic-overlay");
      if (overlay) overlay.style.opacity = String(1 - p * .42);
      const progressBar = document.querySelector(".scroll-progress");
      if (progressBar) progressBar.style.opacity = String(1 - p * .45);
    }, { target: hero, offset: ["start start", "end start"] });
  }

  /* Interior threshold comes into focus like crossing a doorway. */
  const arrival = document.querySelector(".arrival-section");
  const arrivalVisual = document.querySelector(".arrival-visual");
  const arrivalFrame = document.querySelector(".arrival-doorframe");
  if (arrival && arrivalVisual) {
    scroll(progress => {
      const p = clamp(progress, 0, 1);
      arrivalVisual.style.setProperty("--arrival-progress", p.toFixed(3));
      if (arrivalFrame) arrivalFrame.style.transform = `translate3d(0,${(20 - p * 20).toFixed(1)}px,${p * 55}px) scale(${(.93 + p * .07).toFixed(3)})`;
      const light = arrival.querySelector(".arrival-light");
      if (light) light.style.transform = `translate3d(${(-p * 22).toFixed(1)}px,${(p * 16).toFixed(1)}px,0) scale(${(1 + p * .12).toFixed(3)})`;
    }, { target: arrival, offset: ["start end", "end start"] });
  }

  /* Pointer parallax on the house, subtle enough not to compete with the scroll camera. */
  if (house && finePointer.matches) {
    const stage = document.querySelector(".cinematic-stage");
    stage?.addEventListener("pointermove", event => {
      const rect = stage.getBoundingClientRect();
      const dx = (event.clientX - rect.left - rect.width / 2) / rect.width;
      const dy = (event.clientY - rect.top - rect.height / 2) / rect.height;
      house.style.setProperty("--house-rx", `${-dy * 4}deg`);
      house.style.setProperty("--house-ry", `${-8 + dx * 7}deg`);
    });
    stage?.addEventListener("pointerleave", () => {
      house.style.setProperty("--house-rx", "0deg");
      house.style.setProperty("--house-ry", "-8deg");
    });
  }

  /* Header state tracks the journey without hijacking normal navigation. */
  const header = document.querySelector(".site-header");
  if (header) {
    const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();
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
