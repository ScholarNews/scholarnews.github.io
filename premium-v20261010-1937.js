(() => {
  "use strict";
  const SHEET_ID = "1nB7yeMp_j1Jpdl3E0oYgRKFcaZ7Ikxx6_at6s190PZg";
  const SHEET_GID = "";
  const SNAPSHOT_URL = "./data/opportunities.json";
  const CSV_FALLBACK_URL = "./data/sciencecareers_opportunities_latest100.csv";
  const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv" + (SHEET_GID ? "&gid=" + encodeURIComponent(SHEET_GID) : "");
  const SHEET_JSON_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json&responseHandler=scholarNewsSheetCallback" + (SHEET_GID ? "&gid=" + encodeURIComponent(SHEET_GID) : "");
  const CACHE_KEY = "scholarnews-premium-cache-v1";
  const $ = id => document.getElementById(id);
  const state = { rows: [], filtered: [], page: 1, pageSize: 12, sort: "remaining_asc", category: "", savedOnly: false, refreshing: false };
  const v = (row, key) => String(row?.[key] ?? "").trim();
  const low = value => String(value ?? "").trim().toLowerCase();
  const iso = value => { const m = String(value ?? "").match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : ""; };
  const split = value => String(value ?? "").split(/[;,|]+/).map(s => s.trim()).filter(Boolean);
  const uniq = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const safeUrl = value => { try { const u = new URL(String(value ?? ""), location.href); return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const titleOf = row => v(row, "title") || "Untitled opportunity";
  const institutionOf = row => v(row, "hosting_institution") || v(row, "funding_organization") || "Institution not specified";
  const locationOf = row => [v(row, "location"), v(row, "flag_emoji")].filter(Boolean).join(" ");
  const sourceOf = row => safeUrl(v(row, "application_url") || v(row, "source_url"));
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing can disable local storage. */ } }
  };

  function parseCSV(text) {
    const rows = []; let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (quoted) { if (c === '"' && next === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    const headers = (rows.shift() || []).map(x => x.replace(/^\uFEFF/, "").trim());
    return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  }
  function googleRows(obj) {
    const cols = (obj?.table?.cols || []).map(c => String(c.label || c.id || "").trim());
    return (obj?.table?.rows || []).map(rr => Object.fromEntries(cols.map((k, i) => [k, rr.c?.[i]?.f ?? rr.c?.[i]?.v ?? ""]))).filter(r => Object.values(r).some(x => String(x).trim()));
  }
  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Request failed (" + response.status + ")");
    return response.json();
  }
  async function fetchCSV(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Request failed (" + response.status + ")");
    const rows = parseCSV(await response.text());
    if (!rows.length) throw new Error("No rows returned");
    return rows;
  }
  function fetchJSONP() {
    return new Promise((resolve, reject) => {
      const callback = "scholarNewsPremiumSheetCallback";
      const script = document.createElement("script");
      const timer = setTimeout(() => { cleanup(); reject(new Error("Google Sheets timed out")); }, 14000);
      function cleanup() { clearTimeout(timer); try { delete window[callback]; } catch {} script.remove(); }
      window[callback] = data => { try { const rows = googleRows(data); if (!rows.length) throw new Error("Sheet returned no rows"); cleanup(); resolve(rows); } catch (error) { cleanup(); reject(error); } };
      script.onerror = () => { cleanup(); reject(new Error("Google Sheets request failed")); };
      script.src = SHEET_JSON_URL.replace("scholarNewsSheetCallback", callback) + "&t=" + Date.now();
      document.head.appendChild(script);
    });
  }
  async function fetchLive() { try { return await fetchCSV(SHEET_CSV_URL); } catch { return fetchJSONP(); } }

  function remaining(row) {
    const date = iso(v(row, "closing_date"));
    if (date) { const today = new Date(); today.setHours(0, 0, 0, 0); return Math.ceil((new Date(date + "T00:00:00") - today) / 86400000); }
    const match = v(row, "remaining").match(/-?\d+/); return match ? Number(match[0]) : null;
  }
  function isOpen(row) { const days = remaining(row); return days === null || days >= 0; }
  function deadline(row) { return iso(v(row, "closing_date")) || "9999-99-99"; }
  function dateLabel(value) {
    const date = iso(value); if (!date) return String(value || "Not specified");
    return new Date(date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function category(row) {
    const text = low([v(row, "opportunity_type"), v(row, "type_display"), v(row, "job_type"), titleOf(row)].join(" "));
    if (/scholarship|tuition waiver|financial aid/.test(text)) return "Scholarships";
    if (/fellowship/.test(text)) return "Fellowships";
    if (/internship|trainee program/.test(text)) return "Internships";
    if (/award|prize|grant/.test(text)) return "Awards";
    if (/conference|symposium/.test(text)) return "Conferences";
    if (/training|workshop|course|summer school/.test(text)) return "Training";
    return "Jobs";
  }
  function initials(name) { return String(name || "SN").split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join("") || "SN"; }
  function savedKey(row) { return "sn-save-" + (v(row, "job_id") || v(row, "source_url") || titleOf(row)); }
  function sanitizeSummaryHTML(raw) {
    // Descriptions come from the opportunity feed. Keep basic rich-text tags only;
    // never copy arbitrary attributes such as onclick, style, or event handlers.
    const allowedTags = new Set(["P", "STRONG", "B", "EM", "I", "U", "BR", "UL", "OL", "LI", "A", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "HR", "DIV", "SPAN"]);
    const droppedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE", "FORM", "INPUT", "BUTTON", "VIDEO", "AUDIO"]);
    const parsed = new DOMParser().parseFromString(String(raw ?? ""), "text/html");
    const output = document.createElement("div");
    function clean(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
      const tag = node.tagName.toUpperCase();
      if (droppedTags.has(tag)) return document.createDocumentFragment();
      if (!allowedTags.has(tag)) {
        const fragment = document.createDocumentFragment();
        for (const child of node.childNodes) fragment.appendChild(clean(child));
        return fragment;
      }
      const safe = document.createElement(tag.toLowerCase());
      if (tag === "A") {
        const href = node.getAttribute("href") || "";
        try {
          const url = new URL(href, location.href);
          if (["http:", "https:", "mailto:"].includes(url.protocol)) {
            safe.setAttribute("href", url.href);
            if (url.protocol !== "mailto:") {
              safe.setAttribute("target", "_blank");
              safe.setAttribute("rel", "noopener noreferrer");
            }
          }
        } catch { /* Invalid links are rendered as plain link text. */ }
      }
      for (const child of node.childNodes) safe.appendChild(clean(child));
      return safe;
    }
    for (const child of parsed.body.childNodes) output.appendChild(clean(child));
    return output.innerHTML;
  }
  function isSaved(row) { return storage.get(savedKey(row)) === "1"; }

  function fillSelect(id, values, defaultLabel) {
    const el = $(id); if (!el) return;
    const old = el.value;
    el.innerHTML = '<option value="">' + esc(defaultLabel || "All") + '</option>' + uniq(values).map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join("");
    if ([...el.options].some(option => option.value === old)) el.value = old;
  }
  function setupFilters() {
    fillSelect("typeFilter", state.rows.map(row => v(row, "opportunity_type") || v(row, "type_display")), "All types");
    fillSelect("countryFilter", state.rows.map(row => v(row, "hosting_country") || v(row, "location") || v(row, "country_code")), "All locations");
    fillSelect("institutionFilter", state.rows.map(institutionOf), "All institutions");
    fillSelect("levelFilter", state.rows.map(row => v(row, "level")), "All levels");
    fillSelect("orgFilter", state.rows.map(row => v(row, "organization_type")), "All organizations");
    fillSelect("fieldFilter", state.rows.flatMap(row => split(v(row, "discipline"))), "All fields");
  }
  function matches(row) {
    const query = low($("searchInput")?.value);
    if (query && !Object.values(row).join(" ").toLowerCase().includes(query)) return false;
    if (state.category && category(row) !== state.category) return false;
    if (state.savedOnly && !isSaved(row)) return false;
    const checks = [
      ["typeFilter", v(row, "opportunity_type") || v(row, "type_display")],
      ["countryFilter", v(row, "hosting_country") || v(row, "location") || v(row, "country_code")],
      ["institutionFilter", institutionOf(row)], ["levelFilter", v(row, "level")], ["orgFilter", v(row, "organization_type")]
    ];
    for (const [id, value] of checks) { const wanted = low($(id)?.value); if (wanted && low(value) !== wanted) return false; }
    const field = low($("fieldFilter")?.value);
    if (field && !split(v(row, "discipline")).some(value => low(value) === field)) return false;
    const status = $("statusFilter")?.value;
    if (status === "open" && !isOpen(row)) return false;
    if (status === "closed" && isOpen(row)) return false;
    const published = iso(v(row, "published_date")), close = iso(v(row, "closing_date"));
    const pf = $("publishedFrom")?.value, pt = $("publishedTo")?.value, df = $("deadlineFrom")?.value, dt = $("deadlineTo")?.value;
    if (pf && (!published || published < pf)) return false;
    if (pt && (!published || published > pt)) return false;
    if (df && (!close || close < df)) return false;
    if (dt && (!close || close > dt)) return false;
    const email = Boolean(v(row, "emails")), emailFilter = $("emailFilter")?.value;
    if (emailFilter === "yes" && !email) return false;
    if (emailFilter === "no" && email) return false;
    return true;
  }
  function sortRows(a, b) {
    const ad = remaining(a), bd = remaining(b);
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    if (state.sort === "remaining_asc" || state.sort === "deadline_asc") return (ad ?? 999999) - (bd ?? 999999);
    if (state.sort === "deadline_desc") return deadline(b).localeCompare(deadline(a));
    if (state.sort === "title") return titleOf(a).localeCompare(titleOf(b));
    return (iso(v(b, "published_date")) || "").localeCompare(iso(v(a, "published_date")) || "");
  }
  function setStatus(kind, message) {
    const el = $("sourceStatus"); if (!el) return;
    el.textContent = message; el.dataset.kind = kind;
  }
  function updateStats() {
    const open = state.rows.filter(isOpen).length;
    $("statTotal").textContent = state.rows.length.toLocaleString();
    $("statOpen").textContent = open.toLocaleString();
    $("statCountries").textContent = uniq(state.rows.map(row => v(row, "hosting_country") || v(row, "country_code") || v(row, "location"))).length.toLocaleString();
    $("statInstitutions").textContent = uniq(state.rows.map(institutionOf).filter(name => name !== "Institution not specified")).length.toLocaleString();
    $("heroTotal").textContent = state.rows.length.toLocaleString(); $("heroOpen").textContent = open.toLocaleString();
    $("chipAll").textContent = state.rows.length.toLocaleString();
  }
  function card(row, index) {
    const days = remaining(row), open = isOpen(row), urgent = open && days !== null && days <= 14;
    const categoryText = category(row), source = sourceOf(row), saved = isSaved(row);
    const type = v(row, "job_type") || v(row, "type_display") || v(row, "opportunity_type");
    const level = v(row, "level");
    const fields = split(v(row, "discipline")).slice(0, 3);
    const deadlineText = iso(v(row, "closing_date")) ? dateLabel(v(row, "closing_date")) : "Not specified";
    const duration = [v(row, "position_type"), v(row, "work_mode"), v(row, "duration"), v(row, "contract")].filter(Boolean).slice(0, 2).join(" · ");
    return '<article class="opportunity-card"><div class="card-topline"><span class="card-type">' + esc(categoryText) + '</span><button class="card-save ' + (saved ? "saved" : "") + '" type="button" data-save-index="' + index + '" aria-label="' + (saved ? "Remove saved opportunity" : "Save opportunity") + '" title="' + (saved ? "Remove saved listing" : "Save listing") + '">' + (saved ? "★" : "☆") + '</button></div>' +
      '<h4 class="card-title">' + (source ? '<a href="' + esc(source) + '" target="_blank" rel="noopener">' + esc(titleOf(row)) + '</a>' : esc(titleOf(row))) + '</h4>' +
      '<div class="card-institution"><span class="institution-mark">' + esc(initials(institutionOf(row))) + '</span><span><span class="institution-name">' + esc(institutionOf(row)) + '</span><span class="institution-place">' + esc(locationOf(row) || "Location not specified") + '</span></span></div>' +
      '<div class="card-badges">' + (type ? '<span class="badge badge-category">' + esc(type) + '</span>' : '') + (level ? '<span class="badge">' + esc(level) + '</span>' : '') + '<span class="badge ' + (open ? "badge-open" : "badge-closed") + '">' + (open ? "● Open / active" : "● Deadline passed") + '</span>' + (urgent ? '<span class="badge badge-urgent">' + (days === 0 ? "Closes today" : days + " days left") + '</span>' : '') + '</div>' +
      '<div class="card-meta"><div class="card-meta-item"><span class="card-meta-label">CLOSING DATE</span><span class="card-meta-value">' + esc(deadlineText) + '</span></div><div class="card-meta-item"><span class="card-meta-label">FUNDING / COVERAGE</span><span class="card-meta-value">' + esc(v(row, "coverage") || "See official listing") + '</span></div><div class="card-meta-item"><span class="card-meta-label">FIELD</span><span class="card-meta-value">' + esc(fields.join(", ") || "Not specified") + '</span></div><div class="card-meta-item"><span class="card-meta-label">FORMAT</span><span class="card-meta-value">' + esc(duration || "See official listing") + '</span></div></div>' +
      '<div class="card-tags">' + split(v(row, "viral_hashtags")).slice(0, 3).map(tag => '<span class="tag">' + esc(tag) + '</span>').join("") + '</div>' +
      '<div class="card-footer card-footer-premium"><button type="button" class="details-button" data-index="' + index + '">View details <span aria-hidden="true">→</span></button><button type="button" class="quick-apply-button" data-quick-apply-index="' + index + '">Apply with Scholar News <span aria-hidden="true">↗</span></button>' + (source ? '<a class="apply-button" href="' + esc(source) + '" target="_blank" rel="noopener">Official listing <span aria-hidden="true">↗</span></a>' : '') + '</div></article>';
  }
  function renderRadar() {
    const items = state.rows.filter(row => isOpen(row) && remaining(row) !== null).sort((a, b) => remaining(a) - remaining(b)).slice(0, 6);
    $("radarList").innerHTML = items.length ? items.map(row => '<button type="button" class="radar-item" data-radar-index="' + state.rows.indexOf(row) + '"><strong>' + esc(titleOf(row)) + '</strong><span class="radar-days">' + (remaining(row) === 0 ? "Closes today" : remaining(row) + " days left") + '</span><span class="small">' + esc(institutionOf(row)) + '</span></button>').join("") : '<div class="small-muted">No active deadlines found in this snapshot.</div>';
  }
  function renderTrends() {
    const counts = new Map();
    state.rows.forEach(row => split(v(row, "discipline")).forEach(field => counts.set(field, (counts.get(field) || 0) + 1)));
    $("trendList").innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([field, count]) => '<div class="trend-row"><span>' + esc(field) + '</span><strong>' + count + '</strong></div>').join("") || '<div class="small-muted">Field data is not available yet.</div>';
  }
  function render() {
    state.filtered = state.rows.filter(matches).sort(sortRows);
    const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.pageSize;
    const items = state.filtered.slice(start, start + state.pageSize);
    $("resultsGrid").innerHTML = items.length ? items.map((row, i) => card(row, start + i)).join("") : "";
    $("resultCount").textContent = state.filtered.length.toLocaleString();
    $("emptyState").classList.toggle("hidden", state.filtered.length > 0);
    $("pageInfo").textContent = "Page " + state.page + " of " + pages;
    $("prevPage").disabled = state.page <= 1; $("nextPage").disabled = state.page >= pages;
    $("savedCount").textContent = state.rows.filter(isSaved).length.toLocaleString();
    renderRadar(); renderTrends();
  }
  function updateData(rows, sourceLabel, kind) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("The opportunity source returned no records.");
    state.rows = rows.filter(row => row && typeof row === "object");
    setupFilters(); updateStats(); state.page = 1; render();
    setStatus(kind || "snapshot", sourceLabel);
    $("updated").textContent = "Updated " + new Date().toLocaleString();
    try { storage.set(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), rows: state.rows })); } catch {}
  }
  function cachedRows() {
    try { const cache = JSON.parse(storage.get(CACHE_KEY) || "null"); return Array.isArray(cache?.rows) ? cache.rows : []; } catch { return []; }
  }
  async function loadInitialData() {
    // Use the synced GitHub snapshot first so the page is populated before any remote request.
    try { const rows = await fetchJSON(SNAPSHOT_URL + "?t=" + Date.now()); if (Array.isArray(rows) && rows.length) { updateData(rows, "GitHub snapshot · " + rows.length + " records", "snapshot"); return true; } }
    catch (error) { /* Try cache and then the lightweight CSV fallback. */ }
    const cache = cachedRows();
    if (cache.length) { updateData(cache, "Saved snapshot · " + cache.length + " records", "snapshot"); return true; }
    try { const rows = await fetchCSV(CSV_FALLBACK_URL); updateData(rows, "CSV snapshot · " + rows.length + " records", "snapshot"); return true; }
    catch (error) { $("resultsGrid").innerHTML = ""; $("emptyState").classList.remove("hidden"); setStatus("error", "Opportunity data could not be loaded"); return false; }
  }
  async function refreshLive(manual) {
    if (state.refreshing) return;
    state.refreshing = true; $("refreshBtn").disabled = true; $("refreshBtn").textContent = "…";
    if (manual) setStatus("loading", "Refreshing from Google Sheets…");
    try { const rows = await fetchLive(); updateData(rows, "Live GS · " + rows.length + " records", "live"); toast("Opportunity feed refreshed"); }
    catch (error) { if (!state.rows.length) setStatus("error", "Data source unavailable"); else setStatus("snapshot", "Using saved snapshot · live refresh unavailable"); if (manual) toast("Live refresh failed; current listings were kept.", true); }
    finally { state.refreshing = false; $("refreshBtn").disabled = false; $("refreshBtn").textContent = "↻"; }
  }
  function showDetails(row) {
    if (!row) return;
    const fields = [
      ["Opportunity type", v(row, "type_display") || v(row, "opportunity_type") || v(row, "job_type")], ["Level", v(row, "level")],
      ["Field / discipline", v(row, "discipline")], ["Host institution", institutionOf(row)], ["Organization type", v(row, "organization_type")],
      ["Location", locationOf(row)], ["Eligibility", v(row, "eligibility")], ["Closing date", dateLabel(v(row, "closing_date"))],
      ["Time remaining", remaining(row) === null ? v(row, "remaining") : (remaining(row) < 0 ? Math.abs(remaining(row)) + " days past deadline" : remaining(row) + " days left")],
      ["Coverage / funding", v(row, "coverage")], ["Position / duration", [v(row, "position_type"), v(row, "work_mode"), v(row, "duration"), v(row, "contract")].filter(Boolean).join(" · ")],
      ["Contact email", v(row, "emails")], ["Published", dateLabel(v(row, "published_date"))]
    ].filter(pair => pair[1]);
    $("detailTitle").textContent = titleOf(row);
    $("detailSub").textContent = [institutionOf(row), locationOf(row)].filter(Boolean).join(" · ");
    const summary = v(row, "description") || v(row, "job_description") || v(row, "summary");
    $("detailBody").innerHTML = '<div class="detail-grid">' + fields.map(([label, value]) => '<div class="detail-item"><small>' + esc(label) + '</small><div>' + esc(value) + '</div></div>').join("") + '</div>' + (summary ? '<section class="detail-summary"><h3>Summary</h3><div class="detail-description rich-summary">' + sanitizeSummaryHTML(summary) + '</div></section>' : '') + '<div class="detail-actions">' + (sourceOf(row) ? '<a class="apply-button" href="' + esc(sourceOf(row)) + '" target="_blank" rel="noopener">Open official listing <span aria-hidden="true">↗</span></a>' : '') + '<button class="copy-button" id="copyDetails" type="button">Copy details</button></div>';
    $("detailPanel").classList.remove("hidden"); document.body.style.overflow = "hidden";
    $("detailClose").focus();
    $("copyDetails").onclick = () => { const text = [titleOf(row), ...fields.map(([label, value]) => label + ": " + value), sourceOf(row) ? "Official listing: " + sourceOf(row) : ""].filter(Boolean).join("\n"); copyText(text); };
  }
  function openPremium(tool, row) {
    try { sessionStorage.setItem("sn-selected-opportunity-v1", JSON.stringify(row || {})); } catch {}
    window.location.href = new URL("./premium/?tool=" + encodeURIComponent(tool || "cover"), document.baseURI).href;
  }
  window.startScholarNewsApplication = openPremium;
  function closeDetails() { $("detailPanel").classList.add("hidden"); document.body.style.overflow = ""; }
  async function copyText(text) { try { await navigator.clipboard.writeText(text); toast("Opportunity details copied"); } catch { const input = document.createElement("textarea"); input.value = text; document.body.appendChild(input); input.select(); try { document.execCommand("copy"); toast("Opportunity details copied"); } catch { toast("Copy is not available in this browser", true); } input.remove(); } }
  function toast(message, error) { const el = document.createElement("div"); el.className = "toast" + (error ? " error" : ""); el.textContent = message; $("toastRegion").appendChild(el); setTimeout(() => el.remove(), 3000); }
  function resetFilters() {
    $("searchInput").value = ""; document.querySelectorAll(".filters-card select").forEach(el => { el.value = ""; }); document.querySelectorAll(".filters-card input[type=date]").forEach(el => { el.value = ""; });
    state.category = ""; state.savedOnly = false; state.sort = "remaining_asc"; state.page = 1; $("sortSelect").value = state.sort; $("showSavedBtn").classList.remove("active"); updateCategoryNav(); render();
  }
  function updateCategoryNav() { document.querySelectorAll("[data-nav]").forEach(button => button.classList.toggle("active", (button.dataset.nav === "All" ? !state.category : button.dataset.nav === state.category))); }
  function bind() {
    document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => { state.category = button.dataset.nav === "All" ? "" : button.dataset.nav; state.savedOnly = false; $("showSavedBtn").classList.remove("active"); updateCategoryNav(); state.page = 1; render(); document.querySelector(".results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
    $("searchInput").addEventListener("input", () => { state.page = 1; render(); });
    $("searchFocusBtn").addEventListener("click", () => { $("searchInput").focus(); state.page = 1; render(); });
    document.querySelectorAll(".filters-card select,.filters-card input").forEach(el => el.addEventListener("change", () => { state.savedOnly = false; state.page = 1; render(); }));
    $("sortSelect").addEventListener("change", event => { state.sort = event.target.value; state.page = 1; render(); });
    $("prevPage").addEventListener("click", () => { if (state.page > 1) { state.page--; render(); } });
    $("nextPage").addEventListener("click", () => { if (state.page < Math.ceil(state.filtered.length / state.pageSize)) { state.page++; render(); } });
    $("resetBtn").addEventListener("click", resetFilters); $("emptyResetBtn").addEventListener("click", resetFilters);
    $("detailClose").addEventListener("click", closeDetails); $("detailPanel").addEventListener("click", event => { if (event.target === $("detailPanel")) closeDetails(); });
    $("detailBody").addEventListener("click", event => { const action = event.target.closest("[data-detail-apply-tool]"); if (action) openPremium(action.dataset.detailApplyTool, window.scholarNewsSelectedOpportunity); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeDetails(); });
    $("resultsGrid").addEventListener("click", event => {
      const quickApply = event.target.closest("[data-quick-apply-index]");
      if (quickApply) { openPremium("cover", state.filtered[Number(quickApply.dataset.quickApplyIndex)]); return; }
      const save = event.target.closest("[data-save-index]");
      const detail = event.target.closest("[data-index]");
      if (save) { const row = state.filtered[Number(save.dataset.saveIndex)]; storage.set(savedKey(row), isSaved(row) ? "0" : "1"); render(); toast(isSaved(row) ? "Removed from saved listings" : "Saved for later"); return; }
      if (detail) showDetails(state.filtered[Number(detail.dataset.index)]);
    });
    $("radarList").addEventListener("click", event => { const item = event.target.closest("[data-radar-index]"); if (item) showDetails(state.rows[Number(item.dataset.radarIndex)]); });
    $("refreshBtn").addEventListener("click", () => refreshLive(true));
    $("showDeadlineBtn").addEventListener("click", () => { state.category = ""; state.savedOnly = false; $("showSavedBtn").classList.remove("active"); $("statusFilter").value = "open"; state.sort = "remaining_asc"; $("sortSelect").value = state.sort; updateCategoryNav(); render(); document.querySelector(".results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("showSavedBtn").addEventListener("click", () => { state.savedOnly = !state.savedOnly; if (state.savedOnly) { state.category = ""; document.querySelectorAll(".filters-card select").forEach(el => { el.value = ""; }); document.querySelectorAll(".filters-card input[type=date]").forEach(el => { el.value = ""; }); $("searchInput").value = ""; } $("showSavedBtn").classList.toggle("active", state.savedOnly); updateCategoryNav(); state.page = 1; render(); document.querySelector(".results-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("themeBtn").addEventListener("click", () => { const dark = document.documentElement.dataset.theme !== "dark"; document.documentElement.dataset.theme = dark ? "dark" : ""; storage.set("scholarnews-theme", dark ? "dark" : "light"); $("themeBtn").querySelector(".theme-icon").textContent = dark ? "☀" : "☾"; $("themeBtn").querySelector(".theme-label").textContent = dark ? "Light mode" : "Dark mode"; });
    $("mobileMenu").addEventListener("click", () => { const open = $("mainNav").classList.toggle("open"); $("mobileMenu").setAttribute("aria-expanded", String(open)); $("mobileMenu").setAttribute("aria-label", open ? "Close navigation" : "Open navigation"); });
    $("mainNav").querySelectorAll("a").forEach(link => link.addEventListener("click", () => { $("mainNav").classList.remove("open"); $("mobileMenu").setAttribute("aria-expanded", "false"); }));
  }
  async function boot() {
    const theme = storage.get("scholarnews-theme");
    if (theme === "dark") { document.documentElement.dataset.theme = "dark"; $("themeBtn").querySelector(".theme-icon").textContent = "☀"; $("themeBtn").querySelector(".theme-label").textContent = "Light mode"; }
    $("currentYear").textContent = new Date().getFullYear(); bind();
    const loaded = await loadInitialData();
    if (loaded) refreshLive(false);
  }
  document.addEventListener("DOMContentLoaded", boot);
})();