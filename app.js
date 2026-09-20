(() => {
"use strict";
const SHEET_ID="1nB7yeMp_j1Jpdl3E0oYgRKFcaZ7Ikxx6_at6s190PZg";
const SHEET_GID="";
const FALLBACK_URL="./data/sciencecareers_opportunities_latest100.csv";
const SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/"+SHEET_ID+"/gviz/tq?tqx=out:csv"+(SHEET_GID?"&gid="+encodeURIComponent(SHEET_GID):"");
const SHEET_JSON_URL="https://docs.google.com/spreadsheets/d/"+SHEET_ID+"/gviz/tq?tqx=out:json&responseHandler=scholarNewsSheetCallback"+(SHEET_GID?"&gid="+encodeURIComponent(SHEET_GID):"");
const CACHE_KEY="scholarnews-live-opportunities-v1";
const $=id=>document.getElementById(id);
const state={rows:[],filtered:[],page:1,pageSize:12,sort:"remaining_asc",category:""};
const v=(r,k)=>String(r?.[k]??"").trim();
const low=x=>String(x??"").trim().toLowerCase();
const esc=x=>String(x??"").replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[m]));
const iso=x=>{const m=String(x??"").match(/\d{4}-\d{2}-\d{2}/);return m?m[0]:""};
const split=x=>String(x??"").split(/[;,|]+/).map(s=>s.trim()).filter(Boolean);
const uniq=a=>[...new Set(a.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
function parseCSV(t){
 const out=[];let row=[],cell="",q=false;
 for(let i=0;i<t.length;i++){const c=t[i],n=t[i+1];
  if(q){if(c=='"'&&n=='"'){cell+='"';i++}else if(c=='"')q=false;else cell+=c}
  else if(c=='"')q=true;
  else if(c===','){row.push(cell);cell=""}
  else if(c==='\n'){row.push(cell);out.push(row);row=[];cell=""}
  else if(c!=='\r')cell+=c;
 }
 if(cell.length||row.length){row.push(cell);out.push(row)}
 const h=(out.shift()||[]).map(x=>x.replace(/^\uFEFF/,"").trim());
 return out.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??""])));
}
function googleRows(o){
 const cols=(o?.table?.cols||[]).map(c=>c.label||c.id||"");
 return (o?.table?.rows||[]).map(rr=>Object.fromEntries(cols.map((k,i)=>[k,rr.c?.[i]?.f??rr.c?.[i]?.v??""]))).filter(r=>Object.values(r).some(Boolean));
}
function cached(){
 try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");return Array.isArray(x?.rows)?x.rows:[]}catch{return[]}
}
function saveCache(rows){try{localStorage.setItem(CACHE_KEY,JSON.stringify({saved_at:new Date().toISOString(),rows}))}catch{}}
function status(kind,text){const el=$("sourceStatus");el.textContent=text;el.className="source "+(kind==="live"?"source-live":kind==="fallback"?"source-fallback":kind==="error"?"source-error":"")}
async function fetchCSV(url){
 const r=await fetch(url,{cache:"no-store"});
 if(!r.ok)throw new Error("HTTP "+r.status);
 const rows=parseCSV(await r.text());
 if(!rows.length)throw new Error("No rows");
 return rows;
}
function fetchJSONP(){
 return new Promise((resolve,reject)=>{
  const cb="scholarNewsSheetCallback",s=document.createElement("script");
  const timer=setTimeout(()=>{cleanup();reject(new Error("Google Sheet timeout"))},12000);
  function cleanup(){clearTimeout(timer);delete window[cb];s.remove()}
  window[cb]=o=>{try{const rows=googleRows(o);if(!rows.length)throw new Error("No rows returned");cleanup();resolve(rows)}catch(e){cleanup();reject(e)}};
  s.src=SHEET_JSON_URL;s.onerror=()=>{cleanup();reject(new Error("Google Sheet request failed"))};document.head.appendChild(s);
 });
}
async function fetchLive(){
 try{return await fetchCSV(SHEET_CSV_URL)}catch(e){return await fetchJSONP()}
}
function remaining(r){
 const m=v(r,"remaining").match(/-?\d+/);if(m)return Number(m[0]);
 const d=iso(v(r,"closing_date"));if(!d)return null;
 const today=new Date();today.setHours(0,0,0,0);
 return Math.ceil((new Date(d+"T00:00:00")-today)/86400000);
}
function isOpen(r){const n=remaining(r);return n===null||n>=0}
function dateLabel(x){
 const d=iso(x);if(!d)return v({x},"x");
 const p=d.split("-");return p[2]+" "+new Date(+p[0],+p[1]-1,1).toLocaleString(undefined,{month:"short"})+" "+p[0];
}
function category(r){
 const s=low([v(r,"opportunity_type"),v(r,"type_display"),v(r,"job_type"),v(r,"title")].join(" "));
 if(/scholarship/.test(s))return"Scholarships";if(/fellowship/.test(s))return"Fellowships";if(/internship/.test(s))return"Internships";if(/award/.test(s))return"Awards";if(/conference/.test(s))return"Conferences";if(/training|workshop|course/.test(s))return"Training";return"Jobs";
}
function fillSelect(id,values){
 const el=$(id),old=el.value;
 el.innerHTML='<option value="">All</option>'+uniq(values).map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
 if([...el.options].some(o=>o.value===old))el.value=old;
}
function setupFilters(){
 fillSelect("typeFilter",state.rows.map(r=>v(r,"opportunity_type")||v(r,"type_display")));
 fillSelect("countryFilter",state.rows.map(r=>v(r,"hosting_country")||v(r,"location")));
 fillSelect("institutionFilter",state.rows.map(r=>v(r,"hosting_institution")));
 fillSelect("levelFilter",state.rows.map(r=>v(r,"level")));
 fillSelect("orgFilter",state.rows.map(r=>v(r,"organization_type")));
 fillSelect("fieldFilter",state.rows.flatMap(r=>split(v(r,"discipline"))));
}
function matches(r){
 const q=low($("searchInput").value);
 if(q&&!Object.values(r).join(" ").toLowerCase().includes(q))return false;
 if(state.category&&category(r)!==state.category)return false;
 const pairs=[["typeFilter",v(r,"opportunity_type")||v(r,"type_display")],["countryFilter",v(r,"hosting_country")||v(r,"location")],["institutionFilter",v(r,"hosting_institution")],["levelFilter",v(r,"level")],["orgFilter",v(r,"organization_type")]];
 for(const [id,val] of pairs){const s=low($(id).value);if(s&&low(val)!==s)return false}
 const f=low($("fieldFilter").value);if(f&&!split(v(r,"discipline")).some(x=>low(x)===f))return false;
 const st=$("statusFilter").value;if(st==="open"&&!isOpen(r))return false;if(st==="closed"&&isOpen(r))return false;
 if($("publishedFrom").value&&iso(v(r,"published_date"))<$("publishedFrom").value)return false;
 if($("publishedTo").value&&iso(v(r,"published_date"))>$("publishedTo").value)return false;
 if($("deadlineFrom").value&&iso(v(r,"closing_date"))<$("deadlineFrom").value)return false;
 if($("deadlineTo").value&&iso(v(r,"closing_date"))>$("deadlineTo").value)return false;
 const em=!!v(r,"emails");if($("emailFilter").value==="yes"&&!em)return false;if($("emailFilter").value==="no"&&em)return false;
 return true;
}
function sortRows(a,b){
 const ar=remaining(a),br=remaining(b),ao=isOpen(a),bo=isOpen(b),ad=iso(v(a,"closing_date"))||"9999-99-99",bd=iso(v(b,"closing_date"))||"9999-99-99";
 if(ao!==bo)return ao?-1:1;
 if(state.sort==="remaining_asc")return(ar??999999)-(br??999999);
 if(state.sort==="deadline_asc")return ad.localeCompare(bd)||(ar??999999)-(br??999999);
 if(state.sort==="remaining_desc")return(br??-999999)-(ar??-999999);
 if(state.sort==="deadline_desc")return bd.localeCompare(ad);
 if(state.sort==="title")return v(a,"title").localeCompare(v(b,"title"));
 return(iso(v(b,"published_date"))||"").localeCompare(iso(v(a,"published_date"))||"");
}
function initials(n){return(n||"ScholarNews").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("")||"SN"}
function logo(r){
 const file=v(r,"hosting_logo_file"),url=v(r,"hosting_logo_url"),name=v(r,"hosting_institution");
 if(file)return'<div class="logo"><img src="./assets/'+esc(file)+'" alt="" loading="lazy" onerror="this.parentElement.textContent=\''+esc(initials(name))+'\'"></div>';
 if(url)return'<div class="logo"><img src="'+esc(url)+'" alt="" loading="lazy" onerror="this.parentElement.textContent=\''+esc(initials(name))+'\'"></div>';
 return'<div class="logo">'+esc(initials(name))+'</div>';
}
function card(r,i){
 const n=remaining(r),o=isOpen(r),urgent=o&&n!==null&&n<=14,saved=localStorage.getItem("sn-save-"+(v(r,"job_id")||v(r,"source_url")))==="1";
 return'<article class="card"><div class="card-head">'+logo(r)+'<div><div class="eyebrow">'+esc(category(r).toUpperCase())+'</div><h3>'+esc(v(r,"title")||"Untitled opportunity")+'</h3><div class="sub">'+esc(v(r,"hosting_institution"))+' · '+esc(v(r,"location"))+' '+esc(v(r,"flag_emoji"))+'</div></div></div><div class="badges"><span class="badge">💎 '+esc(v(r,"job_type")||v(r,"opportunity_type"))+'</span><span class="badge">🎓 '+esc(v(r,"level"))+'</span><span class="badge '+(o?"open":"closed")+'">'+(o?"● Open / Active":"● Closed")+'</span>'+(urgent?'<span class="badge urgent">🔥 '+n+' days left</span>':'')+'</div><div class="meta"><div class="meta-row"><span>📍</span><span><b>Field</b><br>'+esc(v(r,"discipline")||"Not specified")+'</span></div><div class="meta-row"><span>💼</span><span><b>Status | Contract</b><br>'+esc([v(r,"position_type"),v(r,"work_mode"),v(r,"duration"),v(r,"contract")].filter(Boolean).join(" | ")||"Not specified")+'</span></div><div class="meta-row"><span>💰</span><span><b>Coverage</b><br>'+esc(v(r,"coverage")||"Not specified")+'</span></div><div class="meta-row"><span>📅</span><span><b>Deadline</b><br>'+esc(dateLabel(v(r,"closing_date"))) +(n!==null?" · "+esc(n+" days"):"")+'</span></div></div><div class="tags">'+split(v(r,"viral_hashtags")).slice(0,6).map(x=>'<span class="tag">'+esc(x)+'</span>').join("")+'</div><div class="card-footer"><div class="actions"><button class="btn" data-details="'+i+'" type="button">View details</button><button class="btn save '+(saved?"saved":"")+'" data-save="'+i+'" type="button">'+(saved?"★ Saved":"☆ Save")+'</button></div>'+(v(r,"application_url")||v(r,"source_url")?'<a class="btn primary" href="'+esc(v(r,"application_url")||v(r,"source_url"))+'" target="_blank" rel="noopener">Apply ↗</a>':'')+'</div></article>';
}
function renderRadar(){
 const rs=state.rows.filter(r=>isOpen(r)&&remaining(r)!==null).sort((a,b)=>remaining(a)-remaining(b)).slice(0,7);
 $("radarList").innerHTML=rs.length?rs.map(r=>'<button type="button" class="radar-item" data-radar="'+state.rows.indexOf(r)+'"><strong>'+esc(v(r,"title"))+'</strong><span class="radar-days">🔥 '+esc(remaining(r))+' days left</span><span class="small">'+esc(v(r,"hosting_institution"))+'</span></button>').join(""):'<div class="small">No active deadlines found.</div>';
}
function renderTrends(){
 const m=new Map();state.rows.forEach(r=>split(v(r,"discipline")).forEach(f=>m.set(f,(m.get(f)||0)+1)));
 $("trendList").innerHTML=[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([f,n])=>'<div class="trend-row"><span>'+esc(f)+'</span><strong>'+n+'</strong></div>').join("")||'<div class="small">No field data.</div>';
}
function apply(){state.filtered=state.rows.filter(matches).sort(sortRows);const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));if(state.page>pages)state.page=pages;render();}
function render(){
 const start=(state.page-1)*state.pageSize,items=state.filtered.slice(start,start+state.pageSize);
 $("resultsGrid").innerHTML=items.map((r,i)=>card(r,start+i)).join("");
 $("resultCount").textContent=state.filtered.length.toLocaleString();
 $("emptyState").classList.toggle("hidden",!!state.filtered.length);
 const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));$("pageInfo").textContent="Page "+state.page+" of "+pages;
 $("prevPage").disabled=state.page<=1;$("nextPage").disabled=state.page>=pages;renderRadar();renderTrends();
}
function stats(){
 $("statTotal").textContent=state.rows.length.toLocaleString();
 $("statOpen").textContent=state.rows.filter(isOpen).length.toLocaleString();
 $("statCountries").textContent=uniq(state.rows.map(r=>v(r,"hosting_country")||v(r,"location"))).length.toLocaleString();
 $("statInstitutions").textContent=uniq(state.rows.map(r=>v(r,"hosting_institution"))).length.toLocaleString();
 $("statUrgent").textContent=state.rows.filter(r=>isOpen(r)&&remaining(r)!==null&&remaining(r)<=14).length.toLocaleString();
}
function showDetails(r){
 const fields=[["💎 Type",v(r,"type_display")||v(r,"job_type")],["🎓 Level",v(r,"level")],["📍 Field",v(r,"discipline")],["💼 Status | Duration | Contract",[v(r,"position_type"),v(r,"work_mode"),v(r,"duration"),v(r,"contract")].filter(Boolean).join(" | ")],["💰 Coverage",v(r,"coverage")],["🏛️ Hosting institution",v(r,"hosting_institution")],["🏦 Organization Type",v(r,"organization_type")],["🌍 Hosting Country",v(r,"location")+" "+v(r,"flag_emoji")],["📌 Eligibility",v(r,"eligibility")],["📅 Deadline",dateLabel(v(r,"closing_date"))],["⌛ Remaining",v(r,"remaining")||((remaining(r)??"")+" Days")],["📨 Email",v(r,"emails")],["🔥 Hook 1",v(r,"hook_1")],["🔥 Hook 2",v(r,"hook_2")],["🔥 Hook 3",v(r,"hook_3")],["🔑 Viral Keywords",v(r,"viral_keywords")],["🏷️ Hashtags",v(r,"viral_hashtags")]];
 $("detailTitle").textContent=v(r,"title")||"Opportunity";
 $("detailSub").textContent=[v(r,"hosting_institution"),v(r,"location"),v(r,"flag_emoji")].filter(Boolean).join(" · ");
 $("detailBody").innerHTML='<div class="detail-grid">'+fields.filter(x=>x[1]).map(x=>'<div class="detail"><small>'+esc(x[0])+'</small>'+esc(x[1])+'</div>').join("")+'</div><div class="detail-actions">'+(v(r,"application_url")||v(r,"source_url")?'<a class="btn primary" href="'+esc(v(r,"application_url")||v(r,"source_url"))+'" target="_blank" rel="noopener">Open opportunity ↗</a>':'')+'<button id="copyDetails" class="btn" type="button">Copy details</button></div>';
 $("detailPanel").classList.remove("hidden");$("detailPanel").scrollIntoView({behavior:"smooth",block:"start"});
 $("copyDetails").onclick=()=>navigator.clipboard?.writeText(fields.filter(x=>x[1]).map(x=>x[0]+": "+x[1]).join("\n")).then(()=>toast("Copied")).catch(()=>toast("Copy unavailable"));
}
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),1600)}
function bind(){
 document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>{state.category=b.dataset.nav==="All"?"":b.dataset.nav;document.querySelectorAll("[data-nav]").forEach(x=>x.classList.toggle("active",x===b));state.page=1;apply()}));
 $("searchInput").addEventListener("input",()=>{state.page=1;apply()});
 document.querySelectorAll(".filters select,.filters input").forEach(e=>e.addEventListener("change",()=>{state.page=1;apply()}));
 $("sortSelect").addEventListener("change",e=>{state.sort=e.target.value;state.page=1;apply()});
 $("pageSize").addEventListener("change",e=>{state.pageSize=Number(e.target.value)||12;state.page=1;render()});
 $("prevPage").onclick=()=>{if(state.page>1){state.page--;render()}};$("nextPage").onclick=()=>{if(state.page<Math.ceil(state.filtered.length/state.pageSize)){state.page++;render()}};
 $("resetBtn").onclick=()=>{$("searchInput").value="";document.querySelectorAll(".filters input").forEach(e=>e.value="");document.querySelectorAll(".filters select").forEach(e=>e.value="");state.category="";state.sort="remaining_asc";state.page=1;$("sortSelect").value=state.sort;document.querySelectorAll("[data-nav]").forEach(x=>x.classList.toggle("active",x.dataset.nav==="All"));apply()};
 $("resultsGrid").addEventListener("click",e=>{const d=e.target.closest("[data-details]"),s=e.target.closest("[data-save]");if(d){showDetails(state.filtered[Number(d.dataset.details)]);return}if(s){const r=state.filtered[Number(s.dataset.save)],key="sn-save-"+(v(r,"job_id")||v(r,"source_url")),on=localStorage.getItem(key)==="1";localStorage.setItem(key,on?"0":"1");render();toast(on?"Removed from saved":"Saved locally")}});
 $("radarList").addEventListener("click",e=>{const b=e.target.closest("[data-radar]");if(b)showDetails(state.rows[Number(b.dataset.radar)])});
 $("detailClose").onclick=()=>{$("detailPanel").classList.add("hidden")};
 $("themeBtn").onclick=()=>{const dark=document.documentElement.dataset.theme==="dark";document.documentElement.dataset.theme=dark?"":"dark";localStorage.setItem("scholarnews-theme",dark?"":"dark")};
 $("refreshBtn").onclick=()=>refresh(true);
}
function showRows(rows,kind,label){
 if(!Array.isArray(rows)||!rows.length)return;
 state.rows=rows;stats();setupFilters();apply();status(kind,label);$("updated").textContent="Refreshed "+new Date().toLocaleString();
}
async function refresh(manual=false){
 if(manual)status("loading","Refreshing…");
 try{const live=await fetchLive();saveCache(live);showRows(live,"live","● Live Google Sheet");}
 catch(e){if(!state.rows.length){const fallback=await fetchCSV(FALLBACK_URL);showRows(fallback,"fallback","● Cached GitHub snapshot")}else status("fallback","● Existing data (live refresh failed)");}
}
async function boot(){
 const th=localStorage.getItem("scholarnews-theme");if(th)document.documentElement.dataset.theme=th;
 bind();
 const c=cached();
 if(c.length)showRows(c,"fallback","● Cached live data");
 else try{const fallback=await fetchCSV(FALLBACK_URL);showRows(fallback,"fallback","● GitHub snapshot")}catch(e){}
 refresh(false).catch(()=>{});
}
document.addEventListener("DOMContentLoaded",boot);
})();