(() => {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmt = iso => { try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(iso); } };
  const money = n => n == null ? "" : "₹" + Number(n).toLocaleString("en-IN");
  let me = null, lfilter = "all", cache = [], photos = [], status = "all", offset = 0, total = 0, timer = 0, rows = [];
  const ENQ = "/api/admin/enquiries";

  /* Cookie session: the browser sends it automatically. No token is ever kept in JS or storage. */
  async function call(path, opts = {}) {
    const res = await fetch(path, { credentials: "same-origin", ...opts, headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || "Request failed."); err.status = res.status; throw err; }
    return data;
  }
  const post = (path, body, method = "POST") => call(path, { method, body: JSON.stringify(body) });

  function show(signedIn) {
    $("#login").hidden = signedIn; $("#panel").hidden = !signedIn;
    document.title = (signedIn ? "Dashboard" : "Admin sign in") + " | Mahto Real Estate Agency";
    if (!signedIn) $("#email").focus();
  }
  function enter(user) {
    me = user; show(true);
    $("#who").textContent = user.name + " · " + user.email;
    const chip = $("#role-chip"); chip.textContent = user.role[0].toUpperCase() + user.role.slice(1);
    const admin = user.role === "admin";
    $$("[data-admin]").forEach(b => { b.hidden = !admin; });
    $("#role-note").textContent = admin
      ? "You can review every listing, approve it for the public site, and manage the team."
      : "Add and update your own listings. An admin reviews each one before it appears on the website.";
    tab("listings"); loadListings();
  }
  async function signOut(msg) { try { await post("/api/auth/logout", {}); } catch (_) { /* ignore */ } me = null; show(false); $("#password").value = ""; $("#login-msg").textContent = msg || ""; }
  const expired = e => { if (e.status === 401) { signOut("Your session ended. Please sign in again."); return true; } return false; };

  function tab(name) {
    $$("[role=tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    ["listings", "enquiries", "team"].forEach(n => { $("#view-" + n).hidden = n !== name; });
    $("#panel-title").textContent = { listings: "Listings", enquiries: "Enquiries", team: "Team" }[name];
    if (name === "enquiries") load(); if (name === "team") loadUsers();
  }

  /* ---------- Listings ---------- */
  const form = $("#listing-form");
  function openForm(l) {
    form.reset(); photos = []; thumbs(); form.hidden = false; $("#lf-msg").textContent = "";
    $("#lf-title").textContent = l ? "Edit listing" : "New listing";
    form.elements.id.value = l ? l.id : "";
    if (l) for (const [k, v] of Object.entries(l)) if (form.elements[k] && k !== "id") form.elements[k].value = v == null ? "" : v;
    form.scrollIntoView({ behavior: "smooth", block: "start" }); form.elements.title.focus();
  }
  function stateOf(l) { return l.is_active && l.admin_approved ? ["Live", "ok"] : l.admin_approved ? ["Paused", "warn"] : ["Awaiting approval", "warn"]; }
  async function loadListings() {
    try {
      cache = (await call("/api/admin/listings")).listings; paint();
    } catch (e) { if (!expired(e)) { $("#listings-empty").hidden = false; $("#listings-empty").textContent = e.message; } }
  }
  const isPending = l => !(l.is_active && l.admin_approved);
  function paint() {
    const ul = $("#listings"); ul.replaceChildren();
    const shown = cache.filter(l => lfilter === "all" || (lfilter === "pending" ? isPending(l) : !isPending(l)));
    shown.forEach((l, i) => ul.append(listingCard(l, i)));
    const n = cache.filter(isPending).length; $("#pend-n").textContent = n; $("#tab-listings").textContent = n && me && me.role === "admin" ? "Listings (" + n + " pending)" : "Listings";
    $("#listings-empty").hidden = shown.length > 0; $("#listings-empty").textContent = lfilter === "pending" ? "Nothing waiting for review." : "No listings yet.";
  }
  $$("#lfilter button").forEach(b => b.addEventListener("click", () => { lfilter = b.dataset.f; $$("#lfilter button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); paint(); }));
  function listingCard(l, i) {
    const li = el("li", "item"); li.style.setProperty("--i", Math.min(i, 12));
    const top = el("div", "top"); top.append(el("strong", "", l.title)); const [st, cls] = stateOf(l); top.append(el("span", "pill " + cls, st));
    const tags = el("div", "tags"); [l.property_type, l.availability_status, [l.locality, l.city, l.district].filter(Boolean).join(", "), money(l.asking_price), l.area_value ? l.area_value + " " + (l.area_unit || "") : "", l.featured ? "Featured" : ""].filter(Boolean).forEach(t => tags.append(el("span", "", t)));
    li.append(top, tags); if (l.summary) li.append(el("p", "msgtext", l.summary));
    const acts = el("div", "acts"), btn = (t, fn) => { const b = el("button", "", t); b.type = "button"; b.addEventListener("click", async () => { b.disabled = true; try { await fn(); } catch (e) { if (!expired(e)) alert(e.message); } finally { b.disabled = false; } }); acts.append(b); };
    btn("Edit", async () => openForm(l));
    if (me.role === "admin") {
      if (!(l.is_active && l.admin_approved)) btn("Approve & publish", async () => { await post("/api/admin/listings", { id: l.id, action: "approve" }, "PATCH"); loadListings(); });
      else btn("Pause", async () => { await post("/api/admin/listings", { id: l.id, action: "pause" }, "PATCH"); loadListings(); });
      btn(l.featured ? "Unfeature" : "Feature", async () => { await post("/api/admin/listings", { id: l.id, featured: !l.featured }, "PATCH"); loadListings(); });
    }
    if (me.role === "admin" || !l.admin_approved) btn("Delete", async () => { if (confirm("Remove this listing?")) { await post("/api/admin/listings", { id: l.id }, "DELETE"); loadListings(); } });
    li.append(acts); return li;
  }
  /* Photos are resized in the browser (max 1280px, JPEG) before upload. */
  function resize(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.8)); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Could not read " + file.name)); }; img.src = url;
    });
  }
  function thumbs() {
    const ul = $("#lf-thumbs"); ul.replaceChildren();
    photos.forEach((p, i) => { const li = el("li"), im = el("img"); im.src = p; im.alt = "Selected photo " + (i + 1); const x = el("button", "", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove photo " + (i + 1)); x.addEventListener("click", () => { photos.splice(i, 1); thumbs(); }); li.append(im, x); ul.append(li); });
  }
  $("#lf-photos").addEventListener("change", async e => {
    const msg = $("#lf-msg"); msg.textContent = "";
    for (const f of [...e.target.files]) { if (photos.length >= 8) { msg.textContent = "Up to 8 photos."; break; } try { photos.push(await resize(f)); } catch (err) { msg.textContent = err.message; } }
    e.target.value = ""; thumbs();
  });
  form.addEventListener("submit", async e => {
    e.preventDefault(); const b = form.querySelector("[type=submit]"), msg = $("#lf-msg"); b.disabled = true; msg.textContent = ""; msg.classList.remove("okmsg");
    const body = Object.fromEntries(new FormData(form)); const id = body.id; delete body.id; if (!$("#lf-rights").checked) { msg.textContent = "Please confirm you are authorised to list this property."; b.disabled = false; return; }
    try {
      if (!body.city && body.general_location) body.city = body.general_location.split(",").pop().trim().slice(0, 120);
      const d = id ? await post("/api/admin/listings", { ...body, id: Number(id) }, "PATCH") : await post("/api/admin/listings", body);
      const lid = d.listing.id; let failed = 0;
      for (const p of photos) { try { await post("/api/admin/images", { property_id: lid, data_url: p }); } catch (er) { failed++; if (er.status === 401) throw er; } }
      photos = []; thumbs();
      msg.classList.add("okmsg"); msg.textContent = (d.message || "Saved.") + (failed ? " " + failed + " photo(s) could not be uploaded." : ""); form.hidden = true; loadListings();
    } catch (err) { if (!expired(err)) msg.textContent = err.message; } finally { b.disabled = false; }
  });
  $("#new-listing").addEventListener("click", () => openForm(null));
  $("#lf-cancel").addEventListener("click", () => { form.hidden = true; });
  $("#refresh-listings").addEventListener("click", loadListings);

  /* ---------- Team (admin) ---------- */
  async function loadUsers() {
    try {
      const d = await call("/api/admin/users"), ul = $("#users"); ul.replaceChildren();
      d.users.forEach((u, i) => {
        const li = el("li", "item"); li.style.setProperty("--i", Math.min(i, 12));
        const top = el("div", "top"); top.append(el("strong", "", u.name), el("span", "pill " + (u.is_active ? "ok" : "warn"), u.is_active ? u.role : u.role + " · disabled"));
        li.append(top, el("p", "msgtext", u.email + (u.last_login_at ? " · last sign-in " + fmt(u.last_login_at) : " · never signed in")));
        const acts = el("div", "acts"), b = (t, fn) => { const x = el("button", "", t); x.type = "button"; x.addEventListener("click", async () => { x.disabled = true; try { await fn(); loadUsers(); } catch (e) { if (!expired(e)) alert(e.message); } finally { x.disabled = false; } }); acts.append(x); };
        b(u.is_active ? "Disable" : "Enable", () => post("/api/admin/users", { id: u.id, is_active: !u.is_active }, "PATCH"));
        b("Reset password", async () => { const p = prompt("New password for " + u.email + " (10+ characters):"); if (p) await post("/api/admin/users", { id: u.id, password: p }, "PATCH"); });
        li.append(acts); ul.append(li);
      });
    } catch (e) { if (!expired(e)) { $("#uf-msg").textContent = e.status === 503 ? "Connect the database to manage team accounts." : e.message; } }
  }
  $("#user-form").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector("[type=submit]"), msg = $("#uf-msg"); b.disabled = true; msg.textContent = ""; msg.classList.remove("okmsg");
    try { await post("/api/admin/users", Object.fromEntries(new FormData(f))); msg.classList.add("okmsg"); msg.textContent = "Account created. Share the email and temporary password with them securely."; f.reset(); loadUsers(); }
    catch (err) { if (!expired(err)) msg.textContent = err.message; } finally { b.disabled = false; }
  });

  /* ---------- Enquiries (admin) ---------- */
  async function load(append = false) {
    const q = $("#q").value.trim();
    if (!append) offset = 0;
    const params = new URLSearchParams({ status, limit: "50", offset: String(offset) }); if (q) params.set("q", q);
    try {
      const d = await call(ENQ + "?" + params);
      rows = append ? rows.concat(d.enquiries) : d.enquiries; total = d.total; offset = rows.length; render(d);
    } catch (e) { if (expired(e)) return; $("#note").hidden = false; $("#note").textContent = e.message; }
  }
  function render(d) {
    const list = $("#list"); list.replaceChildren();
    const handled = rows.filter(r => r.handled_at).length;
    if (status === "all" && !$("#q").value.trim()) { $("#s-total").textContent = total; $("#s-done").textContent = handled; $("#s-new").textContent = Math.max(total - handled, 0); }
    const chip = $("#mail-state"); chip.textContent = d.emailNotifications ? "Email alerts on" : "Email alerts off"; chip.classList.toggle("off", !d.emailNotifications);
    const note = $("#note"); note.hidden = d.handledColumn; if (!d.handledColumn) note.textContent = "Handled tracking needs one database step: run the last line of schema.sql.";
    rows.forEach((r, i) => list.append(card(r, i % 12, d.handledColumn)));
    $("#empty").hidden = rows.length > 0; $("#more").hidden = rows.length >= total;
  }
  function card(r, i, canMark) {
    const li = el("li", "item" + (r.handled_at ? " done" : "")); li.style.setProperty("--i", i);
    const top = el("div", "top"); top.append(el("strong", "", r.name), el("span", "when", "#" + r.id + " · " + fmt(r.created_at)));
    const tags = el("div", "tags"); if (!r.handled_at && canMark) tags.append(el("span", "new", "New"));
    [r.interest, r.property_type, r.location, r.budget && "Budget " + r.budget, r.source].filter(Boolean).forEach(t => tags.append(el("span", "", t)));
    li.append(top, tags);
    if (r.details) li.append(el("p", "msgtext", r.details));
    const acts = el("div", "acts"), digits = String(r.phone || "").replace(/\D/g, "");
    const a = (t, href, ext) => { const x = el("a", "", t); x.href = href; if (ext) { x.target = "_blank"; x.rel = "noopener noreferrer"; } return x; };
    acts.append(a("Call " + r.phone, "tel:" + (digits.length === 10 ? "+91" : "+") + digits));
    acts.append(a("WhatsApp", "https://wa.me/" + (digits.length === 10 ? "91" + digits : digits) + "?text=" + encodeURIComponent("Hello " + r.name + ", this is Mahto Real Estate Agency regarding your enquiry."), true));
    if (r.email) acts.append(a("Email reply", "mailto:" + encodeURIComponent(r.email).replace(/%40/g, "@") + "?subject=" + encodeURIComponent("Your enquiry to Mahto Real Estate Agency (#" + r.id + ")")));
    if (canMark) { const b = el("button", "", r.handled_at ? "Mark as new" : "Mark handled"); b.type = "button"; b.addEventListener("click", async () => { b.disabled = true; try { await call(ENQ, { method: "PATCH", body: JSON.stringify({ id: r.id, handled: !r.handled_at }) }); r.handled_at = r.handled_at ? null : new Date().toISOString(); render({ handledColumn: true, emailNotifications: !$("#mail-state").classList.contains("off") }); } catch (e) { b.disabled = false; $("#note").hidden = false; $("#note").textContent = e.message; } }); acts.append(b); }
    li.append(acts); return li;
  }
  async function exportCsv() {
    const b = $("#csv"); b.disabled = true;
    try {
      let all = [], off = 0, n = 1;
      while (off < n && off < 5000) { const d = await call(ENQ + "?" + new URLSearchParams({ status: "all", limit: "200", offset: String(off) })); all = all.concat(d.enquiries); n = d.total; off += 200; if (!d.enquiries.length) break; }
      const cols = ["id", "created_at", "name", "phone", "email", "interest", "property_type", "location", "budget", "details", "source", "handled_at"];
      const esc = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const csv = [cols.join(",")].concat(all.map(r => cols.map(c => esc(r[c])).join(","))).join("\r\n");
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })), l = document.createElement("a");
      l.href = url; l.download = "mahto-enquiries-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { $("#note").hidden = false; $("#note").textContent = e.message; } finally { b.disabled = false; }
  }


  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault(); const btn = e.target.querySelector("[type=submit]"), msg = $("#login-msg"); btn.disabled = true; msg.textContent = "";
    try { const d = await post("/api/auth/login", { email: $("#email").value.trim(), password: $("#password").value }); $("#password").value = ""; enter(d.user); }
    catch (err) { msg.textContent = err.status === 503 ? "Sign-in is not configured on the server yet." : err.message; }
    finally { btn.disabled = false; }
  });
  $("#peek").addEventListener("click", e => { const i = $("#password"), s = i.type === "password"; i.type = s ? "text" : "password"; e.target.textContent = s ? "Hide" : "Show"; e.target.setAttribute("aria-pressed", String(s)); });
  $("#logout").addEventListener("click", () => signOut(""));
  $("#refresh").addEventListener("click", () => load());
  $("#csv").addEventListener("click", exportCsv);
  $("#more").addEventListener("click", () => load(true));
  $("#q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => load(), 300); });
  $$(".seg button").forEach(b => b.addEventListener("click", () => { status = b.dataset.s; $$(".seg button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); load(); }));
  $$("[role=tab]").forEach(b => b.addEventListener("click", () => tab(b.dataset.tab)));

  /* Resume an existing session. */
  call("/api/auth/me").then(d => enter(d.user)).catch(() => show(false));
})();
