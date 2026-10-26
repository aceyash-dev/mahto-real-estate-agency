(() => {
  "use strict";
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#primary-nav");
  if (toggle && nav) {
    const close = () => { toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Open navigation"); nav.classList.remove("is-open"); };
    toggle.addEventListener("click", () => { const open = toggle.getAttribute("aria-expanded") !== "true"; toggle.setAttribute("aria-expanded", String(open)); toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation"); nav.classList.toggle("is-open", open); });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", close));
    document.addEventListener("keydown", event => { if (event.key === "Escape" && nav.classList.contains("is-open")) { close(); toggle.focus(); } });
  }
  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
  const form = document.querySelector("#about-enquiry-form");
  const status = document.querySelector("#about-form-status");
  const started = document.querySelector("#form-started-at");
  if (!form || !status || !started) return;
  started.value = String(Date.now());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    status.textContent = "";
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const phoneDigits = String(data.get("phone") || "").replace(/\D/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15) { status.textContent = "Enter a valid phone number."; form.elements.phone.focus(); return; }
    const email = String(data.get("email") || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = "Enter a valid email address or leave it blank."; form.elements.email.focus(); return; }
    const interestMap = { "Buy": "Buying a property", "Sell": "Selling a property", "Property Visit": "Property Visit", "Broker Collaboration": "Broker collaboration", "General Support": "General Support" };
    const payload = { name: String(data.get("name") || "").trim(), phone: String(data.get("phone") || "").trim(), email, interest: interestMap[data.get("enquiryType")] || "", location: String(data.get("location") || "").trim(), propertyType: String(data.get("propertyType") || "").trim(), budget: String(data.get("budget") || "").trim(), details: String(data.get("details") || "").trim(), consent: data.get("consent") === "on", website: String(data.get("website") || ""), startedAt: Number(data.get("startedAt")), source: "about-contact" };
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; button.setAttribute("aria-busy", "true"); status.textContent = "Submitting your enquiry…";
    try {
      const response = await fetch("/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "We could not submit the enquiry. Please contact the agency directly.");
      status.textContent = result.notificationSent ? "Enquiry submitted. The agency has been notified." : "Enquiry submitted. Email notifications may not be configured; you can also contact the agency directly at princewebdev05@gmail.com or by WhatsApp.";
      form.reset(); started.value = String(Date.now());
    } catch (error) { status.textContent = error.message || "The enquiry service is unavailable. Please call or WhatsApp 9031877384."; }
    finally { button.disabled = false; button.removeAttribute("aria-busy"); }
  });
})();
