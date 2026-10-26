(() => {
  "use strict";

  const menuToggle = document.querySelector(".menu-toggle");
  const primaryNav = document.querySelector("#primary-nav");

  if (menuToggle && primaryNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
      primaryNav.classList.toggle("is-open", !isOpen);
    });

    primaryNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open navigation");
        primaryNav.classList.remove("is-open");
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && primaryNav.classList.contains("is-open")) {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open navigation");
        primaryNav.classList.remove("is-open");
        menuToggle.focus();
      }
    });
  }

  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());

  const searchForm = document.querySelector("#property-search");
  const searchFeedback = document.querySelector("#search-feedback");

  if (searchForm && searchFeedback) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(searchForm);
      const min = Number(formData.get("budgetMin"));
      const max = Number(formData.get("budgetMax"));

      if (formData.get("budgetMin") && min < 0) {
        searchFeedback.textContent = "Enter a minimum budget of zero or more.";
        return;
      }
      if (formData.get("budgetMax") && max < 0) {
        searchFeedback.textContent = "Enter a maximum budget of zero or more.";
        return;
      }
      if (formData.get("budgetMin") && formData.get("budgetMax") && max < min) {
        searchFeedback.textContent = "The maximum budget must be greater than or equal to the minimum budget.";
        return;
      }

      const location = String(formData.get("location") || "").trim();
      const propertyType = String(formData.get("propertyType") || "").trim();
      const summary = [];
      if (propertyType) summary.push(propertyType);
      if (location) summary.push("in " + location);
      searchFeedback.textContent = (summary.length ? "Your search: " + summary.join(" ") + ". " : "") +
        "There are no active, agency-approved listings published on this page yet. Share your requirement below to contact the agency.";
      document.querySelector("#contact").scrollIntoView({ behavior: "smooth", block: "start" });
      const interest = document.querySelector('[name="interest"]');
      if (interest && propertyType) {
        const map = {
          "Plot / Land": "Plot / land",
          "House": "House",
          "Flat / Apartment": "Flat / apartment",
          "Commercial property": "Commercial property",
          "Other": "Other enquiry"
        };
        interest.value = map[propertyType] || "Buying a property";
      }
      const locationInput = document.querySelector('#enquiry-form [name="location"]');
      if (locationInput && location) locationInput.value = location;
      const budgetInput = document.querySelector('#enquiry-form [name="budget"]');
      if (budgetInput && (formData.get("budgetMin") || formData.get("budgetMax"))) {
        budgetInput.value = [formData.get("budgetMin") ? "₹" + formData.get("budgetMin") : "", formData.get("budgetMax") ? "₹" + formData.get("budgetMax") : ""].filter(Boolean).join(" - ");
      }
    });
  }

  document.querySelectorAll("[data-enquiry-type]").forEach((link) => {
    link.addEventListener("click", () => {
      const interest = document.querySelector('#enquiry-form [name="interest"]');
      if (!interest) return;
      const value = link.getAttribute("data-enquiry-type");
      if (value === "Broker enquiry") interest.value = "Broker collaboration";
      if (value === "Customer enquiry") interest.value = "Buying a property";
    });
  });

  const enquiryForm = document.querySelector("#enquiry-form");
  const formStatus = document.querySelector("#form-status");
  if (enquiryForm && formStatus) {
    enquiryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      formStatus.replaceChildren();

      const formData = new FormData(enquiryForm);
      const name = String(formData.get("name") || "").trim();
      const phone = String(formData.get("phone") || "").trim();
      const interest = String(formData.get("interest") || "").trim();
      const location = String(formData.get("location") || "").trim();
      const budget = String(formData.get("budget") || "").trim();
      const details = String(formData.get("details") || "").trim();
      const consent = formData.get("consent");

      if (name.length < 2) {
        formStatus.textContent = "Please enter your name (at least 2 characters).";
        enquiryForm.elements.name.focus();
        return;
      }
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        formStatus.textContent = "Please enter a valid phone number.";
        enquiryForm.elements.phone.focus();
        return;
      }
      if (!interest) {
        formStatus.textContent = "Please choose an enquiry type.";
        enquiryForm.elements.interest.focus();
        return;
      }
      if (!consent) {
        formStatus.textContent = "Please confirm that you agree to share these details for your enquiry.";
        enquiryForm.elements.consent.focus();
        return;
      }

      const lines = [
        "Property enquiry for Mahto Real Estate Agency",
        "Name: " + name,
        "Phone: " + phone,
        "Interest: " + interest,
        location ? "Preferred location: " + location : "",
        budget ? "Approximate budget: " + budget : "",
        details ? "Additional details: " + details : ""
      ].filter(Boolean);

      const link = document.createElement("a");
      link.href = "https://wa.me/919031877384?text=" + encodeURIComponent(lines.join("\n"));
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open WhatsApp to review and send";
      formStatus.append(document.createTextNode("Your message is prepared. Review it in WhatsApp and press Send when ready. "));
      formStatus.append(link);
    });
  }
})();