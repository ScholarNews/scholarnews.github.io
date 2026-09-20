(() => {
  const SHEET_ID = "1nB7yeMp_j1Jpdl3E0oYgRKFcaZ7Ikxx6_at6s190PZg";
  const SHEET_GID = "";
  const FALLBACK_CSV = "./data/sciencecareers_opportunities_latest100.csv";
  const CSV_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
    "/gviz/tq?tqx=out:csv" + (SHEET_GID ? "&gid=" + encodeURIComponent(SHEET_GID) : "");
  const JSONP_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
    "/gviz/tq?tqx=out:json&responseHandler=scholarNewsSheetCallback" +
    (SHEET_GID ? "&gid=" + encodeURIComponent(SHEET_GID) : "");

  const state = {
    rows: [], filtered: [], page: 1, pageSize: 12,
    sort: "remaining_asc", category: "", saved: new Set()
  };
  const $ = id => document.getElementById(id);
  const v = (r,k) => String(r?.[k] ?? "").trim();
  const low = x => String(x ?? "").trim().toLowerCase();
  const esc = x => String(x ?? "").replace(/[&<>'"]/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
  }[m]));
  const iso = x => { const m = String(x ?? "").match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : ""; };
  const split = x => String(x ?? "").split(/[;,|]+/).map(s => s.trim()).filter(Boolean);
  const uniq = xs => [...new Set(xs.filter(Boolean))].sort((a,b)=>a.localeCompare(b));

  function parseCSV(text){
    const rows=[]; let row=[], cell="", quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(quoted){
        if(c === '"' && n === '"'){ cell += '"'; i++; }
        else if(c === '"') quoted=false;
        else cell += c;
      } else {
        if(c === '"') quoted=true;
        else if(c === ','){ row.push(cell); cell=""; }
        else if(c === '\n'){ row.push(cell); rows.push(row); row=[]; cell=""; }
        else if(c !== '\r') cell += c;
      }
    }
    if(cell.length || row.length){ row.push(cell); rows.push(row); }
    const headers=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,"").trim());
    return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
  }

  function googleRows(obj){
    const cols=(obj?.table?.cols||[]).map(c=>c.label || c.id || "");
    return (obj?.table?.rows||[]).map(rr =>
      Object.fromEntries(cols.map((k,i)=>[k, rr.c?.[i]?.f ?? rr.c?.[i]?.v ?? ""]))
    ).filter(r=>Object.values(r).some(Boolean));
  }

  function loadJSONP(){
    return new Promise((resolve,reject)=>{
      const callback="scholarNewsSheetCallback";
      const script=document.createElement("script");
      const timer=setTimeout(()=>{ cleanup(); reject(new Error("Google Sheet timeout")); },15000);
      function cleanup(){ clearTimeout(timer); delete window[callback]; script.remove(); }
      window[callback]=obj=>{ try{ const rows=googleRows(obj); if(!rows.length) throw new Error("Google Sheet returned no records"); cleanup(); resolve(rows); }catch(e){ cleanup(); reject(e);} };
      script.src=JSONP_URL;
      script.onerror=()=>{ cleanup(); reject(new Error("Google Sheet request failed")); };
      document.head.appendChild(script);
    });
  }

  async function loadData(){
    setStatus("loading","Loading live Google Sheet…");
    try{
      try{
        const res=await fetch(CSV_URL,{cache:"no-store"});
        if(res.ok){
          const rows=parseCSV(await res.text());
          if(rows.length){ setStatus("live","Live Google Sheet"); return rows; }
        }
      }catch(e){}
      const rows=await loadJSONP();
      setStatus("live","Live Google Sheet");
      return rows;
    }catch(e){
      try{
        const res=await fetch(FALLBACK_CSV,{cache:"no-store"});
        if(!res.ok) throw new Error("Fallback CSV unavailable");
        const rows=parseCSV(await res.text());
        setStatus("fallback","Cached GitHub snapshot");
        return rows;
      }catch(e2){
        setStatus("error","Data unavailable");
        throw new Error("The Google Sheet could not be read and the cached GitHub snapshot is unavailable.");
      }
    }
  }

  function setStatus(kind,text){
    const el=$("sourceStatus");
    el.textContent=text;
    el.dataset.kind=kind;
  }

  function remaining(r){
    const n=v(r,"remaining").match(/-?\d+/);
    if(n) return Number(n[0]);
    const d=iso(r,"closing_date");
    if(!d) return null;
    const today=new Date(); today.setHours(0,0,0,0);
    return Math.ceil((new Date(d+"T00:00:00")-today)/86400000);
  }
  function isOpen(r){ const n=remaining(r); return n===null || n>=0; }
  function dateLabel(x){
    const d=iso(x); if(!d) return v({x},"x");
    const p=d.split("-");
    return p[2]+" "+new Date(+p[0],+p[1]-1,1).toLocaleString(undefined,{month:"short"})+" "+p[0];
  }

  function normalizeCategory(r){
    const all=low([v(r,"opportunity_type"),v(r,"type_display"),v(r,"job_type"),v(r,"title")].join(" "));
    if(/scholarship/.test(all)) return "Scholarships";
    if(/fellowship/.test(all)) return "Fellowships";
    if(/internship/.test(all)) return "Internships";
    if(/award/.test(all)) return "Awards";
    if(/conference/.test(all)) return "Conferences";
    if(/training|workshop|course/.test(all)) return "Training";
    return "Jobs";
  }

  function categories(){ return ["All","Jobs","Scholarships","Fellowships","Internships","Awards","Conferences","Training"]; }

  function fillSelect(id, values){
    const s=$(id), old=s.value;
    s.innerHTML='<option value="">All</option>'+uniq(values).map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
    if([...s.options].some(o=>o.value===old)) s.value=old;
  }

  function setupFilters(){
    fillSelect("typeFilter",state.rows.map(r=>v(r,"opportunity_type")||v(r,"type_display")));
    fillSelect("countryFilter",state.rows.map(r=>v(r,"hosting_country")||v(r,"location")));
    fillSelect("institutionFilter",state.rows.map(r=>v(r,"hosting_institution")));
    fillSelect("levelFilter",state.rows.map(r=>v(r,"level")));
    fillSelect("orgFilter",state.rows.map(r=>v(r,"organization_type")));
    fillSelect("fieldFilter",state.rows.flatMap(r=>split(v(r,"discipline"))));
  }

  function categoryButtons(){
    $("categoryChips").innerHTML=categories().map(c =>
      '<button type="button" class="chip '+(state.category===(c==="All"?"":c)?"active":"")+'" data-cat="'+esc(c)+'">'+esc(c)+'</button>'
    ).join("");
  }

  function matches(r){
    const q=low($("searchInput").value);
    const searchBlob=Object.values(r).join(" ").toLowerCase();
    if(q && !searchBlob.includes(q)) return false;
    if(state.category && normalizeCategory(r)!==state.category) return false;

    const pairs=[
      ["typeFilter", v(r,"opportunity_type")||v(r,"type_display")],
      ["countryFilter", v(r,"hosting_country")||v(r,"location")],
      ["institutionFilter", v(r,"hosting_institution")],
      ["levelFilter", v(r,"level")],
      ["orgFilter", v(r,"organization_type")]
    ];
    for(const [id,val] of pairs){
      const selected=low($(id).value);
      if(selected && low(val)!==selected) return false;
    }

    const field=low($("fieldFilter").value);
    if(field && !split(v(r,"discipline")).some(x=>low(x)===field)) return false;

    const status=$("statusFilter").value;
    if(status==="open" && !isOpen(r)) return false;
    if(status==="closed" && isOpen(r)) return false;

    if($("publishedFrom").value && iso(v(r,"published_date")) < $("publishedFrom").value) return false;
    if($("publishedTo").value && iso(v(r,"published_date")) > $("publishedTo").value) return false;
    if($("deadlineFrom").value && iso(v(r,"closing_date")) < $("deadlineFrom").value) return false;
    if($("deadlineTo").value && iso(v(r,"closing_date")) > $("deadlineTo").value) return false;

    const em=!!v(r,"emails");
    if($("emailFilter").value==="yes" && !em) return false;
    if($("emailFilter").value==="no" && em) return false;
    return true;
  }

  function sortRows(a,b){
    const ar=remaining(a), br=remaining(b), ao=isOpen(a), bo=isOpen(b);
    const ad=iso(v(a,"closing_date"))||"9999-99-99", bd=iso(v(b,"closing_date"))||"9999-99-99";
    if(ao!==bo) return ao ? -1 : 1;
    if(state.sort==="remaining_asc") return (ar??999999)-(br??999999);
    if(state.sort==="deadline_asc") return ad.localeCompare(bd) || ((ar??999999)-(br??999999));
    if(state.sort==="remaining_desc") return (br??-999999)-(ar??-999999);
    if(state.sort==="deadline_desc") return bd.localeCompare(ad);
    if(state.sort==="title") return v(a,"title").localeCompare(v(b,"title"));
    return (iso(v(b,"published_date"))||"").localeCompare(iso(v(a,"published_date"))||"");
  }

  function apply(){
    state.filtered=state.rows.filter(matches).sort(sortRows);
    const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));
    if(state.page>pages) state.page=pages;
    render();
  }

  function initials(name){
    return (name||"ScholarNews").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("")||"SN";
  }

  function logoMarkup(r){
    const file=v(r,"hosting_logo_file"), url=v(r,"hosting_logo_url"), name=v(r,"hosting_institution");
    if(file) return '<div class="logo"><img src="./assets/'+esc(file)+'" alt="" loading="lazy" onerror="this.parentElement.textContent=\''+esc(initials(name))+'\'"></div>';
    if(url) return '<div class="logo"><img src="'+esc(url)+'" alt="" loading="lazy" onerror="this.parentElement.textContent=\''+esc(initials(name))+'\'"></div>';
    return '<div class="logo">'+esc(initials(name))+'</div>';
  }

  function card(r,i){
    const n=remaining(r), open=isOpen(r), urgent=open && n!==null && n<=14, saved=state.saved.has(v(r,"job_id")||v(r,"source_url"));
    return '<article class="card">'+
      '<div class="card-head">'+logoMarkup(r)+'<div><div class="eyebrow"> '+esc(normalizeCategory(r).toUpperCase())+'</div><h3>'+esc(v(r,"title")||"Untitled opportunity")+'</h3><div class="sub">'+esc(v(r,"hosting_institution"))+' · '+esc(v(r,"location"))+' '+esc(v(r,"flag_emoji"))+'</div></div></div>'+
      '<div class="badges"><span class="badge">💎 '+esc(v(r,"job_type")||v(r,"opportunity_type"))+'</span><span class="badge">🎓 '+esc(v(r,"level"))+'</span><span class="badge '+(open?"open":"closed")+'">'+(open?"● Open / Active":"● Closed")+'</span>'+(urgent?'<span class="badge urgent">🔥 '+n+' days left</span>':'')+'</div>'+
      '<div class="meta"><div class="meta-row"><span>📍</span><span><b>Field</b><br>'+esc(v(r,"discipline")||"Not specified")+'</span></div><div class="meta-row"><span>💼</span><span><b>Status</b><br>'+esc([v(r,"position_type"),v(r,"work_mode"),v(r,"duration"),v(r,"contract")].filter(Boolean).join(" | ")||"Not specified")+'</span></div><div class="meta-row"><span>💰</span><span><b>Coverage</b><br>'+esc(v(r,"coverage")||"Not specified")+'</span></div><div class="meta-row"><span>📅</span><span><b>Deadline</b><br>'+esc(dateLabel(v(r,"closing_date"))) + (n!==null?" · "+esc(n+" days"):"")+'</span></div></div>'+
      '<div class="tags">'+split(v(r,"viral_hashtags")).slice(0,6).map(x=>'<span class="tag">'+esc(x)+'</span>').join("")+'</div>'+
      '<div class="card-footer"><div class="actions"><button class="btn" type="button" data-details="'+i+'">View details</button><button class="btn save '+(saved?"saved":"")+'" type="button" data-save="'+i+'">'+(saved?"★ Saved":"☆ Save")+'</button></div>'+(v(r,"application_url")||v(r,"source_url")?'<a class="btn primary" href="'+esc(v(r,"application_url")||v(r,"source_url"))+'" target="_blank" rel="noopener">Apply ↗</a>':'')+'</div>'+
      '</article>';
  }

  function render(){
    const start=(state.page-1)*state.pageSize, items=state.filtered.slice(start,start+state.pageSize);
    $("resultsGrid").innerHTML=items.map((r,i)=>card(r,start+i)).join("");
    $("resultCount").textContent=state.filtered.length.toLocaleString();
    $("emptyState").classList.toggle("hidden",state.filtered.length>0);
    const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));
    $("pageInfo").textContent="Page "+state.page+" of "+pages;
    $("prevPage").disabled=state.page<=1; $("nextPage").disabled=state.page>=pages;
  }

  function details(r){
    const fields=[
      ["💎 Type",v(r,"type_display")||v(r,"job_type")],["🎓 Level",v(r,"level")],["📍 Field",v(r,"discipline")],
      ["💼 Status | Duration | Contract",[v(r,"position_type"),v(r,"work_mode"),v(r,"duration"),v(r,"contract")].filter(Boolean).join(" | ")],
      ["💰 Coverage",v(r,"coverage")],["🏛️ Hosting institution",v(r,"hosting_institution")],["🏦 Organization Type",v(r,"organization_type")],
      ["🌍 Hosting Country",v(r,"location")+" "+v(r,"flag_emoji")],["📌 Eligibility",v(r,"eligibility")],["📅 Deadline",dateLabel(v(r,"closing_date"))],
      ["⌛ Remaining",v(r,"remaining") || ((remaining(r)??"")+" Days")],["📨 Email",v(r,"emails")],
      ["🔥 Hook 1",v(r,"hook_1")],["🔥 Hook 2",v(r,"hook_2")],["🔥 Hook 3",v(r,"hook_3")],
      ["🔑 Viral Keywords",v(r,"viral_keywords")],["🏷️ Hashtags",v(r,"viral_hashtags")]
    ];
    $("modalBody").innerHTML='<div class="eyebrow">'+esc(normalizeCategory(r).toUpperCase())+'</div><h2>'+esc(v(r,"title"))+'</h2><p class="sub">'+esc(v(r,"hosting_institution"))+' · '+esc(v(r,"location"))+' '+esc(v(r,"flag_emoji"))+'</p><div class="detail-grid">'+fields.filter(x=>x[1]).map(x=>'<div class="detail"><small>'+esc(x[0])+'</small>'+esc(x[1])+'</div>').join("")+'</div><div class="modal-actions">'+(v(r,"application_url")||v(r,"source_url")?'<a class="btn primary" href="'+esc(v(r,"application_url")||v(r,"source_url"))+'" target="_blank" rel="noopener">Open opportunity ↗</a>':'')+'<button id="copyBtn" class="btn">Copy opportunity</button></div>';
    $("modal").classList.remove("hidden");
    $("copyBtn").onclick=()=>navigator.clipboard?.writeText(Object.entries(r).map(([k,val])=>k+": "+val).join("\n")).then(()=>toast("Copied")).catch(()=>toast("Copy unavailable"));
  }

  function toast(msg){
    const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),1800);
  }

  function stats(){
    $("statTotal").textContent=state.rows.length.toLocaleString();
    $("statOpen").textContent=state.rows.filter(isOpen).length.toLocaleString();
    $("statCountries").textContent=uniq(state.rows.map(r=>v(r,"hosting_country")||v(r,"location"))).length.toLocaleString();
    $("statInstitutions").textContent=uniq(state.rows.map(r=>v(r,"hosting_institution"))).length.toLocaleString();
    const urgent=state.rows.filter(r=>isOpen(r) && remaining(r)!==null && remaining(r)<=14).length;
    $("statUrgent").textContent=urgent.toLocaleString();
  }

  function bind(){
    $("searchInput").addEventListener("input",()=>{state.page=1;apply()});
    document.querySelectorAll(".filters select,.filters input").forEach(el=>el.addEventListener("change",()=>{state.page=1;apply()}));
    $("sortSelect").addEventListener("change",e=>{state.sort=e.target.value;state.page=1;apply()});
    $("pageSize").addEventListener("change",e=>{state.pageSize=Number(e.target.value)||12;state.page=1;render()});
    $("prevPage").onclick=()=>{if(state.page>1){state.page--;render()}};
    $("nextPage").onclick=()=>{if(state.page<Math.ceil(state.filtered.length/state.pageSize)){state.page++;render()}};
    $("resetBtn").onclick=()=>{
      $("searchInput").value="";
      document.querySelectorAll(".filters select,.filters input").forEach(e=>e.value="");
      state.category="";state.sort="remaining_asc";state.page=1;
      $("sortSelect").value="remaining_asc";categoryButtons();apply()
    };
    $("categoryChips").onclick=e=>{const b=e.target.closest("[data-cat]");if(!b)return;state.category=b.dataset.cat==="All"?"":b.dataset.cat;categoryButtons();apply()};
    $("resultsGrid").onclick=e=>{
      const d=e.target.closest("[data-details]"), s=e.target.closest("[data-save]");
      if(d)details(state.filtered[Number(d.dataset.details)]);
      if(s){const r=state.filtered[Number(s.dataset.save)], key=v(r,"job_id")||v(r,"source_url");if(state.saved.has(key)){state.saved.delete(key);toast("Removed from saved")}else{state.saved.add(key);toast("Saved locally")}render()}
    };
    $("modalClose").onclick=()=>$("modal").classList.add("hidden");
    $("modal").onclick=e=>{if(e.target.id==="modal")$("modal").classList.add("hidden")};
    $("themeBtn").onclick=()=>{const dark=document.documentElement.dataset.theme==="dark";document.documentElement.dataset.theme=dark?"":"dark";localStorage.setItem("scholarnews-theme",dark?"":"dark")};
    $("refreshBtn").onclick=()=>boot();
  }

  function boot(){
    const savedTheme=localStorage.getItem("scholarnews-theme"); if(savedTheme)document.documentElement.dataset.theme=savedTheme;
    return loadData().then(rows=>{
      state.rows=rows; stats(); setupFilters(); categoryButtons(); bindOnce(); $("updated").textContent="Data source refreshed • "+rows.length+" records";
      apply();
    }).catch(err=>{$("resultsGrid").innerHTML='<div class="empty">'+esc(err.message)+'</div>';});
  }

  let bound=false;
  function bindOnce(){if(bound)return;bound=true;bind()}

  boot();
})();