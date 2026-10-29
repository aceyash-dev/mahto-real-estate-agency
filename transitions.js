/* transitions.dev-style helpers: FAQ accordion, field shake, success check, label swap. Exposed as window.TD. */
(() => {
  "use strict";
  const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  /* Accordion on native <details>: keeps semantics and no-JS behaviour, animates height/opacity/blur. */
  document.querySelectorAll(".faq-list details").forEach(d => {
    const summary = d.querySelector("summary"), panel = d.querySelector(":scope > p");
    if (!summary || !panel) return;
    summary.addEventListener("click", event => {
      if (rm.matches || !panel.animate) return;
      event.preventDefault();
      if (d.dataset.busy) return;
      d.dataset.busy = "1";
      const done = () => { delete d.dataset.busy; panel.style.cssText = ""; };
      if (!d.open) {
        d.open = true;
        const h = panel.offsetHeight;
        panel.style.overflow = "hidden";
        panel.animate([{ height: "0px", opacity: 0, filter: "blur(2px)", marginBottom: "0px" }, { height: h + "px", opacity: 1, filter: "blur(0)", marginBottom: getComputedStyle(panel).marginBottom }], { duration: 320, easing: EASE }).onfinish = done;
      } else {
        const h = panel.offsetHeight;
        panel.style.overflow = "hidden";
        panel.animate([{ height: h + "px", opacity: 1, filter: "blur(0)" }, { height: "0px", opacity: 0, filter: "blur(2px)", marginBottom: "0px" }], { duration: 220, easing: EASE }).onfinish = () => { d.open = false; done(); };
      }
    });
  });

  window.TD = {
    shake(el) {
      const f = el && (el.closest ? el.closest(".field") : null);
      if (!f || rm.matches) return;
      f.classList.remove("is-shaking"); void f.offsetWidth; f.classList.add("is-shaking");
      f.addEventListener("animationend", () => f.classList.remove("is-shaking"), { once: true });
    },
    check(status, text) {
      status.replaceChildren();
      const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "t-check"); svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true");
      const c = document.createElementNS(ns, "circle"); c.setAttribute("cx", "8"); c.setAttribute("cy", "8"); c.setAttribute("r", "6.5"); c.setAttribute("pathLength", "1");
      const p = document.createElementNS(ns, "path"); p.setAttribute("d", "M5 8.3l2 2 4-4.4"); p.setAttribute("pathLength", "1");
      svg.append(c, p); status.append(svg, document.createTextNode(text));
    },
    swap(el, next) {
      if (!el) return;
      if (rm.matches) { el.textContent = next; return; }
      let inner = el.querySelector(".t-text-swap");
      if (!inner) { inner = document.createElement("span"); inner.className = "t-text-swap"; inner.textContent = el.textContent; el.replaceChildren(inner); }
      inner.classList.add("is-exit");
      setTimeout(() => { inner.textContent = next; inner.classList.remove("is-exit"); inner.classList.add("is-enter-start"); void inner.offsetHeight; inner.classList.remove("is-enter-start"); }, 200);
    }
  };
})();
