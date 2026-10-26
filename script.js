(() => {
  "use strict";
  const menuToggle = document.querySelector(".menu-toggle");
  const primaryNav = document.querySelector("#primary-nav");
  if (menuToggle && primaryNav) {
    const closeMenu = () => { menuToggle.setAttribute("aria-expanded", "false"); menuToggle.setAttribute("aria-label", "Open navigation"); primaryNav.classList.remove("is-open"); };
    menuToggle.addEventListener("click", () => {
      const open = menuToggle.getAttribute("aria-expanded") !== "true";
      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      primaryNav.classList.toggle("is-open", open);
    });
    primaryNav.querySelectorAll("a").forEach(a => a.addEventListener("click", closeMenu));
    document.addEventListener("keydown", e => { if (e.key === "Escape" && primaryNav.classList.contains("is-open")) { closeMenu(); menuToggle.focus(); } });
  }
  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());

  const searchForm = document.querySelector("#property-search");
  const searchFeedback = document.querySelector("#search-feedback");
  const listingsRoot = document.querySelector("#property-listings");
  const emptyState = document.querySelector("#empty-listings");
  const enquiryForm = document.querySelector("#enquiry-form");
  const formStatus = document.querySelector("#form-status");
  const money = value => value == null || value === "" ? "Price on enquiry" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
  const escapeText = value => String(value ?? "");

  function showEmpty(message) {
    if (listingsRoot) {
      listingsRoot.replaceChildren();
      const box = document.createElement("div"); box.className = "empty-state";
      const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Property listings";
      const title = document.createElement("h3"); title.textContent = "Tell us what you have in mind.";
      const body = document.createElement("p"); body.textContent = message;
      const link = document.createElement("a"); link.className = "button button-primary"; link.href = "#contact"; link.textContent = "Share your requirement ↗";
      box.append(eyebrow, title, body, link); listingsRoot.append(box);
    }
  }
  function renderListings(properties) {
    if (!listingsRoot) return;
    if (!properties.length) { showEmpty("No active, agency-approved properties match these filters. Try changing the filters or share your requirement with the agency."); return; }
    const grid = document.createElement("div"); grid.className = "listing-grid";
    properties.forEach(property => {
      const card = document.createElement("article"); card.className = "listing-card";
      if (property.photo_url) {
        const img = document.createElement("img"); img.className = "listing-photo"; img.src = property.photo_url; img.alt = property.photo_alt || "Property photograph"; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer"; card.append(img);
      } else { const placeholder = document.createElement("div"); placeholder.className = "listing-photo-placeholder"; placeholder.setAttribute("aria-hidden", "true"); placeholder.textContent = "M."; card.append(placeholder); }
      const body = document.createElement("div"); body.className = "listing-body";
      const status = document.createElement("span"); status.className = "listing-status"; status.textContent = "Active listing";
      const title = document.createElement("h3"); title.textContent = escapeText(property.title || property.property_type || "Property listing");
      const location = document.createElement("p"); location.className = "listing-location"; location.textContent = [property.locality, property.district, property.state].filter(Boolean).join(", ") || "Location available on enquiry";
      const price = document.createElement("p"); price.className = "listing-price"; price.textContent = money(property.asking_price);
      const meta = document.createElement("p"); meta.className = "listing-meta"; meta.textContent = [property.property_type, property.area_value ? `${property.area_value} ${property.area_unit || ""}`.trim() : "Area on enquiry"].filter(Boolean).join(" · ");
      body.append(status, title, location, price, meta);
      if (property.summary) { const summary = document.createElement("p"); summary.className = "listing-detail"; summary.textContent = property.summary; body.append(summary); }
      const details = document.createElement("details"); details.className = "listing-detail-toggle";
      const summary = document.createElement("summary"); summary.className = "button button-outline listing-view"; summary.textContent = "View details";
      const detailText = document.createElement("p"); detailText.className = "listing-detail"; detailText.textContent = property.description || "Contact the agency for further listing details and to arrange a discussion or visit.";
      const enquiry = document.createElement("a"); enquiry.className = "button button-primary listing-view"; enquiry.href = "#contact"; enquiry.textContent = "Enquire about this property";
      enquiry.addEventListener("click", () => {
        if (!enquiryForm) return;
        const interest = enquiryForm.elements.interest; if (interest) interest.value = property.property_type || "Buying a property";
        const locationField = enquiryForm.elements.location; if (locationField) locationField.value = [property.locality, property.district, property.state].filter(Boolean).join(", ");
        const detailsField = enquiryForm.elements.details; if (detailsField) detailsField.value = `Enquiry about listing: ${property.title || property.property_type || "Property"} (reference ${property.slug || property.id || "available on request"}).`;
      });
      details.append(summary, detailText, enquiry); body.append(details); card.append(body); grid.append(card);
    });
    listingsRoot.replaceChildren(grid);
  }
  async function loadListings() {
    if (!listingsRoot) return;
    try {
      const params = new URLSearchParams();
      if (searchForm) new FormData(searchForm).forEach((v, k) => { if (String(v).trim()) params.set(k, String(v).trim()); });
      const response = await fetch(`/api/properties?${params.toString()}`, { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (response.status === 503) { showEmpty("The listings service is not connected yet. Please contact the agency directly while the database is being configured."); return; }
      if (!response.ok) throw new Error("Listings endpoint unavailable");
      renderListings(Array.isArray(data.properties) ? data.properties : []);
    } catch (_) {
      showEmpty("We could not load listings right now. Please contact the agency with your requirement or try again later.");
    }
  }
  if (searchForm && searchFeedback) {
    searchForm.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(searchForm);
      const min = data.get("budgetMin"); const max = data.get("budgetMax"); const amin = data.get("areaMin"); const amax = data.get("areaMax");
      if ((min && Number(min) < 0) || (max && Number(max) < 0) || (amin && Number(amin) < 0) || (amax && Number(amax) < 0)) { searchFeedback.textContent = "Budget and area values must be zero or greater."; return; }
      if (min && max && Number(max) < Number(min)) { searchFeedback.textContent = "Maximum budget must be at least the minimum budget."; return; }
      if (amin && amax && Number(amax) < Number(amin)) { searchFeedback.textContent = "Maximum area must be at least the minimum area."; return; }
      searchFeedback.textContent = "Checking active, approved listings…";
      await loadListings();
      searchFeedback.textContent = "Showing active, agency-approved listings that match your filters, if any are available.";
    });
    searchForm.addEventListener("reset", () => { window.setTimeout(() => { searchFeedback.textContent = "Filters reset."; loadListings(); }, 0); });
  }
  document.querySelectorAll("[data-enquiry-type]").forEach(link => link.addEventListener("click", () => {
    if (!enquiryForm) return;
    if (link.dataset.enquiryType === "Broker enquiry") enquiryForm.elements.interest.value = "Broker collaboration";
    if (link.dataset.enquiryType === "Customer enquiry") enquiryForm.elements.interest.value = "Buying a property";
  }));

  if (enquiryForm && formStatus) {
    enquiryForm.addEventListener("submit", async event => {
      event.preventDefault(); formStatus.replaceChildren();
      const fd = new FormData(enquiryForm);
      const payload = Object.fromEntries(["name", "phone", "interest", "location", "budget", "details"].map(key => [key, String(fd.get(key) || "").trim()]));
      payload.consent = fd.get("consent") === "on";
      if (payload.name.length < 2) { formStatus.textContent = "Please enter your name (at least 2 characters)."; enquiryForm.elements.name.focus(); return; }
      const digits = payload.phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) { formStatus.textContent = "Please enter a valid phone number."; enquiryForm.elements.phone.focus(); return; }
      if (!payload.interest || !payload.consent) { formStatus.textContent = "Choose an enquiry type and confirm the consent notice."; return; }
      const submit = enquiryForm.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = "Sending securely…";
      try {
        const response = await fetch("/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || (response.status === 503 ? "Enquiry service is not configured yet. Please contact the agency by phone or WhatsApp." : "We could not submit your enquiry. Please try again or contact the agency directly."));
        formStatus.textContent = "Your enquiry has been submitted. The agency can follow up using the contact details you provided.";
        enquiryForm.reset();
      } catch (error) {
        formStatus.textContent = error.message || "Enquiry service is temporarily unavailable. Please contact the agency by phone or WhatsApp.";
        if (!/not configured/i.test(formStatus.textContent)) {
          const wa = document.createElement("a"); wa.href = "https://wa.me/919031877384?text=" + encodeURIComponent(["Property enquiry for Mahto Real Estate Agency", `Name: ${payload.name}`, `Phone: ${payload.phone}`, `Interest: ${payload.interest}`, payload.location ? `Preferred location: ${payload.location}` : "", payload.budget ? `Approximate budget: ${payload.budget}` : "", payload.details ? `Details: ${payload.details}` : ""].filter(Boolean).join("\n")); wa.target = "_blank"; wa.rel = "noopener noreferrer"; wa.textContent = "Open WhatsApp to send your enquiry"; formStatus.append(document.createElement("br"), wa);
        }
      } finally { submit.disabled = false; submit.innerHTML = 'Submit enquiry <span aria-hidden="true">↗</span>'; }
    });
  }
  loadListings();
})();
