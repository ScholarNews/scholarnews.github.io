(() => {
"use strict";
const $ = id => document.getElementById(id);
const cfg = window.SN_SUPABASE_CONFIG || {};
const SELECTED_KEY = "sn-selected-opportunity-v1";
const statusLabels = {interested:"Interested",preparing:"Preparing documents",ready:"Ready to submit",submitted:"Submitted",interview:"Interview",offer:"Offer received",rejected:"Unsuccessful",withdrawn:"Withdrawn"};
const tools = {
 eligibility:{title:"Eligibility & requirements",desc:"Extract common requirement categories from the official call and record what you need to verify.",icon:"✓",fields:[["title","Opportunity title","text",""],["institution","Institution / organization","text",""],["description","Official opportunity description","textarea","Paste the requirements and eligibility section"],["profile","Your relevant qualifications","textarea","Degree, country/residency, experience, dates, key evidence"]]},
 cover:{title:"Cover / motivation letter",desc:"Create a clear first draft using the official opportunity and your genuine reasons for applying.",icon:"✉",fields:[["name","Your full name","text",""],["email","Your email","email",""],["title","Opportunity title","text",""],["institution","Institution / organization","text",""],["description","Official description / selection criteria","textarea","Paste the relevant official details"],["profile","Relevant background and evidence","textarea","Education, experience, projects, methods, outcomes, skills"],["motivation","Why this opportunity?","textarea","Your genuine motivation and goals"]]},
 cv:{title:"CV tailoring assistant",desc:"Review the match between the listing and your real experience. This suggests edits; it does not automatically rewrite a CV file.",icon:"▤",fields:[["title","Opportunity title","text",""],["description","Official description / essential criteria","textarea","Paste job or scholarship criteria"],["profile","Your current CV / experience bullets","textarea","Paste CV text or the parts you want to improve"],["target","Target emphasis","text","e.g. research methods, teaching, clinical experience"]]},
 email:{title:"Academic email",desc:"Draft a professional supervisor inquiry, application message, referee request or follow-up.",icon:"＠",fields:[["purpose","Email purpose","select",""],["name","Your name","text",""],["recipient","Recipient name / title","text","Professor / Dr / Hiring committee"],["institution","Institution / organization","text",""],["title","Opportunity / subject","text",""],["description","What do you need to say or ask?","textarea","Add accurate context and specific questions"],["profile","Brief relevant background","textarea","Your experience and reason for writing"]]},
 statement:{title:"Academic statement",desc:"Organize a statement of purpose, research statement, teaching statement or letter of intent.",icon:"✎",fields:[["kind","Statement type","select",""],["name","Your name","text",""],["title","Program / opportunity","text",""],["institution","Institution","text",""],["description","Official aims / selection criteria","textarea","Paste relevant program details"],["profile","Relevant academic / professional evidence","textarea","Research, teaching, projects, publications and achievements"],["goals","Interests and future goals","textarea","Specific interests, approach and plans"]]}
};
let db=null, user=null, selected=null, activeTool="cover", apps=[], drafts=[], profile={}, cvFiles=[], authMode="signin", recoveryMode=false, activeDraftKey="", activeDraftTitle="", toastTimer=null, pendingAutoTrack=false, sessionGeneration=0;
const trim=v=>String(v==null?"":v).trim();
function decodeHTMLEntities(value){const node=document.createElement("textarea");node.innerHTML=String(value==null?"":value);return node.value;}
function cleanOfficialText(value){
 let text=String(value==null?"":value).replace(/\\([<>])/g,"$1");
 for(let i=0;i<3;i++){const decoded=decodeHTMLEntities(text);if(decoded===text)break;text=decoded;}
 text=text.replace(/<br\s*\/?\s*>/gi,"\n")
  .replace(/<li\b[^>]*>/gi,"• ")
  .replace(/<\/(?:p|div|section|article|h[1-6]|li|ul|ol|blockquote|tr)>/gi,"\n")
  .replace(/<[^>]*>/g," ");
 text=decodeHTMLEntities(text);
 return text.replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim();
}

function normalizeCVText(value){return String(value||"").replace(/\u0000/g,"").replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim();}
function pdfItemsToLines(items){
 const positioned=(items||[]).filter(item=>item&&typeof item.str==="string"&&item.str.trim()).map((item,index)=>({text:item.str.trim(),x:Number(item.transform?.[4]),y:Number(item.transform?.[5]),index,hasEOL:Boolean(item.hasEOL)}));
 if(!positioned.length)return "";
 if(!positioned.every(item=>Number.isFinite(item.x)&&Number.isFinite(item.y)))return positioned.map(item=>item.text+(item.hasEOL?"\n":" ")).join("").replace(/[ \t]+/g," ").trim();
 const lines=[];
 for(const item of positioned){
  let line=lines.find(candidate=>Math.abs(candidate.y-item.y)<=2.5);
  if(!line){line={y:item.y,items:[]};lines.push(line);}
  line.items.push(item);
 }
 return lines.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(" ").replace(/[ \t]{2,}/g," ").trim()).filter(Boolean).join("\n");
}
function cleanCVForEvidence(value){
 return normalizeCVText(String(value||"")
  .replace(/\b(?:PG|PAGE)\.?\s*\d+\s*(?:\/|OF)\s*\d+\b/gi," ")
  .replace(/^\s*(?:PG|PAGE)\.?\s*\d+\s*(?:\/|OF)\s*\d+\s*$/gim,"")
  .replace(/\b(?:https?:\/\/|www\.)\S+/gi," ")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi," ")
  .replace(/\+?\d[\d\s().-]{7,}\d/g,match=>(match.match(/\d/g)||[]).length>=9?" ":match)
  .replace(/\|\s*(?:\|\s*)+/g," | "));
}
function cleanExtractedCVText(value){
 const sectionHeading=/\b(?:PROFESSIONAL\s+SUMMARY|CAREER\s+SUMMARY|PROFESSIONAL\s+PROFILE|PERSONAL\s+PROFILE|CAREER\s+OBJECTIVE|OBJECTIVE|WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|ACADEMIC\s+EXPERIENCE|EMPLOYMENT\s+HISTORY|RESEARCH\s+EXPERIENCE|TEACHING\s+EXPERIENCE|EDUCATION(?:AL\s+BACKGROUND)?|ACADEMIC\s+QUALIFICATIONS|QUALIFICATIONS|TECHNICAL\s+SKILLS|CORE\s+COMPETENCIES|KEY\s+SKILLS|SKILLS|PUBLICATIONS|RESEARCH\s+PROJECTS|PROJECTS|AWARDS|HONOURS|HONORS|CERTIFICATIONS|CERTIFICATES|LANGUAGES|VOLUNTEER\s+EXPERIENCE|REFERENCES)\b/i;
 const bulletPrefix=/^\s*(?:(?:[•▪◦●○◆◇■□‣⁃·∙*]+)\s*|\(?\d{1,3}[.)]\s+|[A-Za-z][.)]\s+)/u;
 let text=String(value||"").replace(/\f/g,"\n").replace(/\u0000/g,"").replace(/\r/g,"");
 // When a page counter is followed by the start of a section, remove only the counter.
 // Otherwise drop the repeated page-header/footer line entirely.
 text=text.split("\n").map(line=>{
  const page=line.match(/^\s*(?:PG|PAGE)\.?\s*\d+\s*(?:\/|OF)\s*\d+\s*(.*)$/i);
  if(!page)return line;
  return sectionHeading.test(page[1])?page[1]:page[1].trim()?(/(?:https?:\/\/|www\.|@|orcid|google scholar|linkedin|github|\+?\d[\d\s().-]{7,}\d)/i.test(page[1])?"":page[1]):"";
 }).join("\n");
 text=text
  .replace(/\b(?:PG|PAGE)\.?\s*\d+\s*(?:\/|OF)\s*\d+\b/gi," ")
  .replace(/^\s*(?:page\s*)?\d+\s*(?:\/|of)\s*\d+\s*$/gim,"")
  .replace(/^\s*(?:page|pg\.?)\s*\d+\s*$/gim,"");
 let lines=normalizeCVText(text).split("\n").map(line=>line.replace(/[ \t]+/g," ").trim()).filter(Boolean);
 const firstHeading=lines.findIndex(line=>sectionHeading.test(line));
 if(firstHeading>=0){
  const headingMatch=sectionHeading.exec(lines[firstHeading]);
  if(headingMatch)lines[firstHeading]=lines[firstHeading].slice(headingMatch.index).trim();
  // A CV's personal/contact banner is not work evidence.
  lines=lines.slice(firstHeading);
 }
 // Strip decorative bullet glyphs and list-number prefixes but preserve the text of every item.
 lines=lines.map(line=>line.replace(bulletPrefix,"").trim()).filter(Boolean);
 // Drop stand-alone counters and contact/footer lines.
 lines=lines.filter(line=>{
  if(/^(?:(?:pg|page)\.?\s*)?\d+\s*(?:\/|of)\s*\d+$/i.test(line))return false;
  if(/^(?:page|pg\.?)\s*\d+$/i.test(line))return false;
  if(/^(?:confidential|curriculum vitae|résumé|resume)\s*(?:\|\s*)?$/i.test(line))return false;
  if(/^(?:https?:\/\/|www\.)\S+$/i.test(line))return false;
  if(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(line))return false;
  return true;
 });
 // Remove repeated short page headers/footers while keeping the first occurrence of each line.
 const counts=new Map();
 for(const line of lines){const key=line.toLowerCase().replace(/\s+/g," ").trim();if(key.length>=8&&key.length<=105)counts.set(key,(counts.get(key)||0)+1);}
 const seen=new Set();
 lines=lines.filter(line=>{
  const key=line.toLowerCase().replace(/\s+/g," ").trim();
  if(counts.get(key)>=2&&key.length>=8&&key.length<=105&&!sectionHeading.test(line)){
   if(seen.has(key))return false;
   seen.add(key);
  }
  return true;
 });
 return normalizeCVText(lines.join("\n"));
}

async function extractCVTextFromFile(file,ext){
 if(ext==="pdf"){
  const pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.mjs";
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const pages=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
   const page=await pdf.getPage(pageNo);
   const content=await page.getTextContent();
   pages.push(pdfItemsToLines(content.items));
  }
  const text=normalizeCVText(pages.join("\n\n"));
  if(!text.replace(/\s/g,"").length)throw new Error("No selectable text was found. This may be a scanned/image-only PDF; use a text-based PDF or DOCX file.");
  return text;
 }
 if(ext==="docx"){
  if(!window.mammoth||typeof window.mammoth.extractRawText!=="function")throw new Error("The DOCX text extractor could not load. Refresh the page and try again.");
  const result=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
  const text=normalizeCVText(result.value);
  if(!text)throw new Error("No readable text was found in this DOCX file.");
  return text;
 }
 if(ext==="doc")throw new Error("This is a legacy .doc file. It can be stored privately, but browser extraction supports PDF and .docx. Open it in Word and save as PDF or .docx, then upload that copy to extract the text.");
 throw new Error("For CV analysis, upload a PDF or DOCX file.");
}
function guessCVFacts(raw){
 const text=normalizeCVText(raw),lines=text.split("\n").map(line=>line.trim()).filter(Boolean);
 const email=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||"";
 let fullName="";
 const headingAt=text.search(/\b(?:PROFESSIONAL\s+SUMMARY|PROFESSIONAL\s+EXPERIENCE|EDUCATION|WORK\s+EXPERIENCE|SKILLS|PUBLICATIONS)\b/i);
 const headerText=text.slice(0,headingAt>=0?headingAt:Math.min(text.length,1800));
 const nameCandidates=[...headerText.split(/[|\n]/),...lines.slice(0,18)];
 const skip=/^(curriculum vitae|resume|résumé|cv|personal details|contact|contact information|professional profile|profile|education|experience|work experience|employment history|skills|publications|references|research interests|statement of purpose|phd|m\.?sc\.?|b\.?sc\.?)$/i;
 for(let candidate of nameCandidates.slice(0,40)){
  candidate=candidate.replace(/^\s*(?:PG|PAGE)\.?\s*\d+\s*(?:\/|OF)\s*\d+\s*/i,"")
   .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi," ")
   .replace(/(?:https?:\/\/|www\.)\S+/gi," ")
   .replace(/\+?\d[\d\s().-]{7,}\d/g,match=>(match.match(/\d/g)||[]).length>=9?" ":match)
   .replace(/\b(?:ORCID|GOOGLE SCHOLAR|LINKEDIN|GITHUB)\b/gi," ")
   .replace(/\s+/g," ").trim();
  if(candidate.length>65||skip.test(candidate)||/@|https?:\/\/|www\.|[\d]{3,}/i.test(candidate))continue;
  if(/^[\p{L}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+){1,4}$/u.test(candidate)){fullName=candidate;break;}
 }
 let education_level="";
 if(/\b(ph\.?\s*d\.?|doctor of philosophy|doctorate|doctoral candidate)\b/i.test(text))education_level="PhD / Doctorate";
 else if(/\b(master'?s|m\.?\s*sc\.?|m\.?\s*a\.?|m\.?\s*eng\.?|mba|mph)\b/i.test(text))education_level="Master’s";
 else if(/\b(bachelor'?s|b\.?\s*sc\.?|b\.?\s*a\.?|b\.?\s*eng\.?)\b/i.test(text))education_level="Bachelor’s";
 else if(/\b(postdoctoral|post-doc|postdoc)\b/i.test(text))education_level="Postdoctoral";
 const institutionLine=lines.find(line=>line.length<180&&/\b(university|college|institute|hospital|laboratory|school)\b/i.test(line)&&!/education|institutional knowledge|school of thought/i.test(line));
 const institution=institutionLine?institutionLine.split(/[,;|]/).map(part=>part.trim()).filter(Boolean).find(part=>/\b(university|college|institute|hospital|laboratory|school)\b/i.test(part))||institutionLine:"";
 let discipline="";
 for(const line of lines.slice(0,120)){
  if(line.length>220)continue;
  const m=line.match(/(?:ph\.?\s*d\.?|doctorate|master'?s|m\.?\s*sc\.?|bachelor'?s|b\.?\s*sc\.?|major|degree)\s+(?:degree\s+)?(?:in|of)\s+([^,;|.]{3,75})/i);
  if(m){discipline=m[1].trim().replace(/\s+/g," ");if(discipline.length>4)break;}
 }
 const countries=[
  ["United Arab Emirates","AE",["United Arab Emirates","UAE","Emirati"]],
  ["United Kingdom","GB",["United Kingdom","UK","Britain","British"]],
  ["United States","US",["United States of America","United States","USA","U.S.A.","American"]],
  ["South Africa","ZA",["South Africa","South African"]],
  ["South Korea","KR",["South Korea","Republic of Korea","Korean"]],
  ["North Korea","KP",["North Korea","DPRK"]],
  ["Saudi Arabia","SA",["Saudi Arabia","Saudi"]],
  ["New Zealand","NZ",["New Zealand"]],
  ["Sri Lanka","LK",["Sri Lanka"]],
  ["Costa Rica","CR",["Costa Rica"]],
  ["Dominican Republic","DO",["Dominican Republic"]],
  ["Czechia","CZ",["Czechia","Czech Republic"]],
  ["The Netherlands","NL",["The Netherlands","Netherlands","Dutch"]],
  ["Ivory Coast","CI",["Ivory Coast","Côte d’Ivoire","Cote d'Ivoire"]],
  ["Democratic Republic of the Congo","CD",["Democratic Republic of the Congo","DR Congo"]],
  ["Republic of the Congo","CG",["Republic of the Congo"]],
  ["Bosnia and Herzegovina","BA",["Bosnia and Herzegovina"]],
  ["Trinidad and Tobago","TT",["Trinidad and Tobago"]],
  ["Papua New Guinea","PG",["Papua New Guinea"]],
  ["United Republic of Tanzania","TZ",["Tanzania","Tanzanian"]],
  ["Egypt","EG",["Egypt","Egyptian"]],
  ["Italy","IT",["Italy","Italian"]],
  ["Afghanistan","AF",["Afghanistan"]],["Albania","AL",["Albania"]],["Algeria","DZ",["Algeria","Algerian"]],
  ["Argentina","AR",["Argentina","Argentinian","Argentine"]],["Australia","AU",["Australia","Australian"]],["Austria","AT",["Austria","Austrian"]],
  ["Azerbaijan","AZ",["Azerbaijan"]],["Bahrain","BH",["Bahrain"]],["Bangladesh","BD",["Bangladesh"]],["Belarus","BY",["Belarus"]],
  ["Belgium","BE",["Belgium","Belgian"]],["Bolivia","BO",["Bolivia"]],["Brazil","BR",["Brazil","Brazilian"]],["Bulgaria","BG",["Bulgaria"]],
  ["Cambodia","KH",["Cambodia"]],["Cameroon","CM",["Cameroon"]],["Canada","CA",["Canada","Canadian"]],["Chile","CL",["Chile"]],
  ["China","CN",["China","Chinese"]],["Colombia","CO",["Colombia"]],["Croatia","HR",["Croatia"]],["Cyprus","CY",["Cyprus"]],
  ["Denmark","DK",["Denmark","Danish"]],["Ecuador","EC",["Ecuador"]],["Estonia","EE",["Estonia"]],["Ethiopia","ET",["Ethiopia"]],
  ["Finland","FI",["Finland"]],["France","FR",["France","French"]],["Georgia","GE",["Georgia"]],["Germany","DE",["Germany","German"]],
  ["Ghana","GH",["Ghana"]],["Greece","GR",["Greece","Greek"]],["Hungary","HU",["Hungary"]],["Iceland","IS",["Iceland"]],
  ["India","IN",["India","Indian"]],["Indonesia","ID",["Indonesia"]],["Iran","IR",["Iran"]],["Iraq","IQ",["Iraq"]],
  ["Ireland","IE",["Ireland"]],["Israel","IL",["Israel"]],["Jamaica","JM",["Jamaica"]],["Japan","JP",["Japan","Japanese"]],
  ["Jordan","JO",["Jordan"]],["Kazakhstan","KZ",["Kazakhstan"]],["Kenya","KE",["Kenya"]],["Kuwait","KW",["Kuwait"]],
  ["Latvia","LV",["Latvia"]],["Lebanon","LB",["Lebanon"]],["Libya","LY",["Libya"]],["Lithuania","LT",["Lithuania"]],
  ["Luxembourg","LU",["Luxembourg"]],["Malaysia","MY",["Malaysia"]],["Maldives","MV",["Maldives"]],["Malta","MT",["Malta"]],
  ["Mauritius","MU",["Mauritius"]],["Mexico","MX",["Mexico"]],["Moldova","MD",["Moldova"]],["Mongolia","MN",["Mongolia"]],
  ["Montenegro","ME",["Montenegro"]],["Morocco","MA",["Morocco"]],["Mozambique","MZ",["Mozambique"]],["Myanmar","MM",["Myanmar","Burma"]],
  ["Nepal","NP",["Nepal"]],["Nigeria","NG",["Nigeria"]],["North Macedonia","MK",["North Macedonia"]],["Norway","NO",["Norway"]],
  ["Oman","OM",["Oman"]],["Pakistan","PK",["Pakistan"]],["Palestine","PS",["Palestine","Palestinian Territories"]],["Panama","PA",["Panama"]],
  ["Paraguay","PY",["Paraguay"]],["Peru","PE",["Peru"]],["Philippines","PH",["Philippines"]],["Poland","PL",["Poland"]],
  ["Portugal","PT",["Portugal"]],["Qatar","QA",["Qatar"]],["Romania","RO",["Romania"]],["Russia","RU",["Russia","Russian Federation"]],
  ["Rwanda","RW",["Rwanda"]],["Senegal","SN",["Senegal"]],["Serbia","RS",["Serbia"]],["Singapore","SG",["Singapore"]],
  ["Slovakia","SK",["Slovakia"]],["Slovenia","SI",["Slovenia"]],["Spain","ES",["Spain","Spanish"]],["Sudan","SD",["Sudan","Sudanese"]],
  ["Sweden","SE",["Sweden","Swedish"]],["Switzerland","CH",["Switzerland","Swiss"]],["Syria","SY",["Syria"]],["Taiwan","TW",["Taiwan"]],
  ["Thailand","TH",["Thailand"]],["Tunisia","TN",["Tunisia","Tunisian"]],["Türkiye","TR",["Türkiye","Turkey","Turkish"]],
  ["Uganda","UG",["Uganda"]],["Ukraine","UA",["Ukraine"]],["Uruguay","UY",["Uruguay"]],["Uzbekistan","UZ",["Uzbekistan"]],
  ["Venezuela","VE",["Venezuela"]],["Vietnam","VN",["Vietnam","Viet Nam"]],["Yemen","YE",["Yemen"]],["Zambia","ZM",["Zambia"]],["Zimbabwe","ZW",["Zimbabwe"]]
 ];
 const countryHeader=headerText.slice(0,2600);
 const findCountry=source=>{
  for(const [country,code,aliases] of countries){
   for(const alias of aliases){
    const escaped=alias.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
    if(new RegExp("\\b"+escaped+"\\b","i").test(source))return country+" ("+code+")";
   }
  }
  return "";
 };
 let country=findCountry(countryHeader)||findCountry(text.slice(0,12000));
 if(!country){
  for(const [name,code] of countries){
   const codeRe=new RegExp("(?:\\||,|\\(|/)\\s*"+code+"\\b(?:\\s*[)|,;|]|\\s*$)","i");
   if(codeRe.test(countryHeader)){country=name+" ("+code+")";break;}
  }
 }
 return {full_name:fullName,email,education_level,institution,discipline,country};
}
function makeCVEvidence(raw,tool){
 const text=cleanCVForEvidence(cleanExtractedCVText(cleanOfficialText(raw)));
 if(!text)return "";
 const definitions=[
  ["Professional summary",/PROFESSIONAL\s+SUMMARY|PROFESSIONAL\s+PROFILE|CAREER\s+SUMMARY|PERSONAL\s+PROFILE|PROFILE|SUMMARY/],
  ["Experience",/PROFESSIONAL\s+EXPERIENCE|WORK\s+EXPERIENCE|EMPLOYMENT\s+HISTORY|ACADEMIC\s+EXPERIENCE|RELEVANT\s+EXPERIENCE|EXPERIENCE/],
  ["Research",/RESEARCH\s+EXPERIENCE|RESEARCH\s+INTERESTS|RESEARCH\s+PROFILE|RESEARCH/],
  ["Education",/EDUCATION\s+AND\s+QUALIFICATIONS|EDUCATIONAL\s+BACKGROUND|ACADEMIC\s+QUALIFICATIONS|EDUCATION|QUALIFICATIONS/],
  ["Teaching",/TEACHING\s+EXPERIENCE|TEACHING\s+PROFILE|TEACHING/],
  ["Skills",/TECHNICAL\s+SKILLS|LABORATORY\s+SKILLS|CORE\s+COMPETENCIES|KEY\s+SKILLS|COMPUTER\s+SKILLS|SKILLS/],
  ["Publications",/SELECTED\s+PUBLICATIONS|PEER[- ]REVIEWED\s+PUBLICATIONS|PUBLICATIONS/],
  ["Projects",/RESEARCH\s+PROJECTS|SELECTED\s+PROJECTS|PROJECTS/],
  ["Awards",/AWARDS\s+AND\s+HONOU?RS|GRANTS\s+AND\s+AWARDS|HONOU?RS|AWARDS/],
  ["Certifications",/CERTIFICATIONS|CERTIFICATES|PROFESSIONAL\s+DEVELOPMENT/],
  ["Languages",/LANGUAGES|LANGUAGE\s+SKILLS/]
 ];
 const alternatives=definitions.map(([,re])=>re.source).sort((a,b)=>b.length-a.length).join("|");
 const rx=new RegExp("\\b("+alternatives+")\\b","gi");
 const found=[];let match;
 while((match=rx.exec(text))){
  const rawHeading=match[1],start=match.index;
  const letters=rawHeading.replace(/[^A-Za-z]/g,"");
  const isUpper=letters&&letters===letters.toUpperCase();
  const lineStart=text.lastIndexOf("\n",start)+1,lineEnd=text.indexOf("\n",start);
  const wholeLine=text.slice(lineStart,lineEnd<0?text.length:lineEnd).trim().replace(/:$/,"");
  const exactLine=wholeLine.toLowerCase()===rawHeading.toLowerCase();
  if(!isUpper&&!exactLine)continue;
  const definition=definitions.find(([,re])=>re.test(rawHeading));
  if(!definition)continue;
  if(found.length&&start<found[found.length-1].end)continue;
  found.push({label:definition[0],start,end:rx.lastIndex});
 }
 const sections=[];
 for(let i=0;i<found.length;i++){
  const h=found[i],end=i+1<found.length?found[i+1].start:text.length;
  let body=text.slice(h.end,end).replace(/^[\s:|•·\-–—]+/u,"").trim();
  body=body.split("\n").map(line=>line.replace(/^\s*(?:(?:[•▪◦●○◆◇■□‣⁃·∙*]+)\s*|\(?\d{1,3}[.)]\s+|[A-Za-z][.)]\s+)/u,"").replace(/[ \t]{2,}/g," ").trim()).filter(Boolean).join("\n");
  body=cleanCVForEvidence(body);
  // Headings with no real content (for example a stray "AWARDS: &") are not evidence.
  if(body&&/[\p{L}\p{N}]/u.test(body))sections.push({label:h.label,body});
 }
 if(!sections.length){
  // Preserve all readable content; no short fallback preview or arbitrary character cap.
  return cleanCVForEvidence(cleanExtractedCVText(text));
 }
 // Keep source order and each full section, including all bullets, dates, dissertation titles and evidence.
 // The cover-letter background field must never begin with country/residency metadata.
 return sections.map(section=>section.label+":\n"+section.body).join("\n\n");
}
function fillBlankProfileInputs(facts){
 const values={profileName:facts.full_name,profileCountry:facts.country,profileInstitution:facts.institution,profileLevel:facts.education_level,profileDiscipline:facts.discipline};
 if(facts.email){const emailField=$("profileEmail");if(emailField&&(!trim(emailField.value)||trim(emailField.value)===user.email))emailField.value=facts.email;}
 Object.entries(values).forEach(([id,value])=>{const el=$(id);if(el&&value&&!trim(el.value))el.value=value;});
}
async function saveExtractedCVToProfile(text,facts,ownerId=user?.id){
 if(!ownerId||!user||user.id!==ownerId)return {message:"Your account changed during CV processing. Please upload the file again while signed in."};
 const payload={
  user_id:ownerId,email:trim($("profileEmail").value)||facts.email||profile.email||user.email,
  full_name:trim($("profileName").value)||profile.full_name||user.user_metadata?.full_name||facts.full_name||"",
  country:trim($("profileCountry").value)||facts.country||profile.country||"",
  institution:trim($("profileInstitution").value)||profile.institution||facts.institution||"",
  education_level:trim($("profileLevel").value)||profile.education_level||facts.education_level||"",
  discipline:trim($("profileDiscipline").value)||profile.discipline||facts.discipline||"",
  cv_text:cleanExtractedCVText(text),updated_at:new Date().toISOString()
 };
 const {error}=await db.from("profiles").upsert(payload);
 if(!user||user.id!==ownerId)return {message:"Your account changed during CV processing. Please upload the file again while signed in."};
 if(error)return error;
 profile=payload;
 $("profileName").value=payload.full_name;
 $("profileCountry").value=payload.country;
 $("profileInstitution").value=payload.institution;
 $("profileLevel").value=payload.education_level;
 $("profileDiscipline").value=payload.discipline;
 $("profileCVText").value=payload.cv_text;
 return null;
}

function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function isReady(){return Boolean(cfg.url&&cfg.anonKey&&!/YOUR_|PASTE_|example/i.test(cfg.url+cfg.anonKey)&&window.supabase&&typeof window.supabase.createClient==="function");}
function toast(msg,error){const el=$("deskToast");el.textContent=msg;el.classList.toggle("error",!!error);el.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("visible"),3600);}
function status(id,msg,kind){const el=$(id);if(!el)return;el.textContent=msg;el.classList.toggle("success",kind==="success");el.classList.toggle("error",kind==="error");}
function requireReady(){if(!isReady()){goView("account");status("authStatus","Account storage is not configured yet. Follow the setup guide first.","error");$("authSetupInline").hidden=false;return false;}return true;}
function requireUser(){if(!user){goView("account");status("authStatus",isReady()?"Please sign in to save to your private account.":"Configure the account database in the setup guide, then sign in to save privately.","error");if(!isReady())$("authSetupInline").hidden=false;return false;}return true;}
function goView(name){const valid=["dashboard","prepare","profile","applications","account"];if(!valid.includes(name))name="dashboard";valid.forEach(v=>{$("view-"+v).hidden=v!==name;});document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));if(name==="profile"&&user)loadProfile();if(name==="applications"&&user)loadApps();if(name==="account")syncAuth();window.scrollTo({top:0,behavior:"smooth"});}
function valueFrom(keys){if(!selected)return "";for(const k of keys)if(selected[k])return trim(selected[k]);return "";}
function safeDeadline(v){const s=trim(v);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;}
function oppKey(row){if(!row)return "";const url=trim(row.application_url||row.source_url||row.url);if(url)return url.slice(0,450);return [trim(row.title),trim(row.hosting_institution||row.funding_organization||row.institution)].join("|").slice(0,450);}
function safeHTTP(value){try{const u=new URL(trim(value),location.href);return ["https:","http:"].includes(u.protocol)?u.href:"";}catch{return "";}}
function currentOpportunity(){return {title:valueFrom(["title","opportunity_title"]),institution:valueFrom(["hosting_institution","funding_organization","institution","organization"]),deadline:safeDeadline(valueFrom(["closing_date","deadline","application_deadline"])),official_url:valueFrom(["application_url","source_url","url"]),opportunity_key:oppKey(selected),status:"interested"};}
function fieldHTML(item){const key=item[0],label=item[1],type=item[2],placeholder=item[3]||"",id="field-"+key;let input;if(type==="textarea")input='<textarea id="'+id+'" name="'+key+'" placeholder="'+esc(placeholder)+'"></textarea>';else if(type==="select"){const opts=key==="purpose"?[["supervisor","Contact a potential supervisor"],["application","Submit an application"],["referee","Request a recommendation"],["followup","Polite follow-up"],["question","Ask about requirements or funding"]]:[["sop","Statement of purpose"],["research","Research statement"],["teaching","Teaching statement"],["intent","Letter of intent"],["personal","Personal statement"],["career","Career goals statement"]];input='<select id="'+id+'" name="'+key+'">'+opts.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join("")+'</select>';}else input='<input id="'+id+'" name="'+key+'" type="'+type+'" placeholder="'+esc(placeholder)+'">';return '<div class="field '+(type==="textarea"?"full":"")+'"><label for="'+id+'">'+esc(label)+'</label>'+input+'</div>';}
function vals(){const result={};new FormData($("toolForm")).forEach((v,k)=>result[k]=trim(v));return result;}

function prefillActiveToolFromProfile(){
 if(!user||!tools[activeTool]||!$("toolFields"))return;
 const evidence=makeCVEvidence(profile.cv_text,activeTool);
 const country=profile.country||"";
 // Country/residency belongs in eligibility context, not the cover-letter "Relevant background and evidence" field.
 const profileEvidence=activeTool==="eligibility"&&country?["Country / residency: "+country,evidence].filter(Boolean).join("\n\n"):evidence;
 const values={name:profile.full_name||user.user_metadata?.full_name||"",email:profile.email||user.email||"",institution:profile.institution||"",profile:profileEvidence};
 for(const [key,value] of Object.entries(values)){
  const el=$("field-"+key);
  if(el&&value&&!trim(el.value))el.value=value;
 }
}
function addMotivationSuggestions(tool){
 const target=$("field-"+(tool==="statement"?"goals":"motivation"));
 if(!target||!["cover","statement"].includes(tool)||target.parentElement.querySelector(".motivation-suggestions"))return;
 const wrap=document.createElement("div");wrap.className="motivation-suggestions";
 const caption=document.createElement("small");caption.textContent="Explore several wording options. Choosing another replaces the last suggested statement from these buttons, so repeated clicks won’t duplicate it.";
 wrap.appendChild(caption);
 const labels=[["fit","Match my background"],["contribution","Contribution & impact"],["growth","Career development"]];
 for(const [kind,label] of labels){
  const button=document.createElement("button");button.type="button";button.className="motivation-suggestion";button.textContent=label;button.dataset.motivationSuggestion=kind;button.setAttribute("aria-expanded","false");wrap.appendChild(button);
 }
 const panel=document.createElement("div");panel.className="motivation-options";panel.hidden=true;panel.setAttribute("aria-live","polite");wrap.appendChild(panel);
 target.insertAdjacentElement("afterend",wrap);
}
function opportunityFocusWords(){
 const opportunity=[$("field-title")?.value||"",$("field-description")?.value||"",$("field-institution")?.value||""].join(" ").toLowerCase();
 const cv=(profile.cv_text||$("field-profile")?.value||"").toLowerCase();
 const areas=["biochemistry","computational biology","bioinformatics","drug discovery","nanotechnology","nano-formulation","pharmaceutical sciences","chemistry","organic chemistry","biophysics","molecular biology","public health","clinical research","data science","machine learning","artificial intelligence","teaching","laboratory instruction","research","engineering","environmental science","materials science","medicine","nursing","computer science","economics","education","policy","leadership","project management"];
 const target=areas.find(area=>opportunity.includes(area))||trim($("field-title")?.value)||"the work described in this opportunity";
 const shared=areas.find(area=>cv.includes(area)&&opportunity.includes(area));
 const background=shared||trim(profile.discipline)||areas.find(area=>cv.includes(area))||"the skills and experience documented in my CV";
 return {target,background,institution:trim($("field-institution")?.value)||"the organization"};
}
function buildMotivationSuggestion(kind,index=0){
 const {target,background,institution}=opportunityFocusWords();
 const options={
  fit:[
   "My background in "+background+" aligns with this opportunity’s focus on "+target+". I am keen to bring the knowledge and experience described in my CV to the role while continuing to develop my expertise in this area.",
   "Through my experience in "+background+", I have developed a foundation relevant to "+target+". This opportunity is a strong fit for my current skills and the direction in which I hope to grow.",
   "The connection between my experience in "+background+" and this opportunity’s work in "+target+" particularly motivates me. I would be excited to apply my existing strengths while learning from this environment.",
   "My academic and professional experience has prepared me to engage with work related to "+target+". I see this as a natural next step where I can build on my background in "+background+"."
  ],
  contribution:[
   "I hope to contribute to "+institution+" by applying my experience in "+background+" to the objectives of this opportunity, collaborating constructively with colleagues, and supporting meaningful work related to "+target+".",
   "I would bring a thoughtful, reliable approach and the skills I have developed in "+background+". I am especially interested in supporting "+target+" through collaboration, evidence-based problem-solving, and a focus on results.",
   "Beyond benefiting from this opportunity, I aim to contribute actively through my strengths in "+background+", share ideas with the team, and support practical progress on "+target+".",
   "I value environments where people combine expertise and collaboration to solve meaningful problems. I would welcome the chance to contribute my experience in "+background+" to "+institution+"'s work related to "+target+"."
  ],
  growth:[
   "This opportunity would help me deepen my expertise in "+target+" while building on my current background in "+background+". I am eager to learn from experienced colleagues and translate that learning into a stronger contribution.",
   "At this stage of my career, I am looking for an opportunity that challenges me to grow professionally, broaden my perspective, and strengthen my skills in "+target+" while making a useful contribution.",
   "I see this opportunity as a valuable step toward my longer-term goals: developing greater depth in "+target+", learning new approaches, and applying them responsibly in my work.",
   "Engaging with "+target+" would allow me to extend my existing experience in "+background+" and develop capabilities that support sustained, meaningful work in this field."
  ]
 };
 const list=options[kind]||options.fit;
 return list[((Number(index)||0)%list.length+list.length)%list.length];
}
function renderMotivationOptions(wrap,kind){
 const panel=wrap.querySelector(".motivation-options");
 if(!panel)return;
 const labels={fit:"Match my background",contribution:"Contribution & impact",growth:"Career development"};
 panel.dataset.kind=kind;
 panel.innerHTML='<div class="motivation-options-heading"><strong>'+esc(labels[kind]||"Suggested statements")+'</strong><span>Choose one of these four options</span></div><div class="motivation-option-list">'+[0,1,2,3].map(index=>'<article class="motivation-option-card"><div class="motivation-option-label">OPTION '+(index+1)+'</div><p>'+esc(buildMotivationSuggestion(kind,index))+'</p><button type="button" class="motivation-option-use" data-motivation-option="'+esc(kind)+'" data-motivation-index="'+index+'" aria-pressed="false">Use this statement</button></article>').join("")+'</div>';
 panel.hidden=false;
 wrap.querySelectorAll("[data-motivation-suggestion]").forEach(button=>{
  const active=button.dataset.motivationSuggestion===kind;
  button.classList.toggle("active",active);
  button.setAttribute("aria-expanded",String(active));
 });
}
function useMotivationSuggestion(target,suggestion){
 suggestion=trim(suggestion);
 if(!target||!suggestion)return;
 const value=target.value||"";
 const oldText=target.dataset.snSuggestionText||"";
 if(value.includes(suggestion)){
  if(suggestion===oldText)toast("That statement is already selected.");
  else toast("That statement is already in the text. Choose a different option.");
  return;
 }
 let startAt=-1;
 if(oldText){
  const recorded=Number(target.dataset.snSuggestionStart);
  if(Number.isInteger(recorded)&&recorded>=0&&value.slice(recorded,recorded+oldText.length)===oldText)startAt=recorded;
  else startAt=value.lastIndexOf(oldText);
 }
 let nextValue;
 if(startAt>=0){
  nextValue=value.slice(0,startAt)+suggestion+value.slice(startAt+oldText.length);
 }else{
  const start=target.selectionStart??value.length,end=target.selectionEnd??start;
  const before=value.slice(0,start);
  const separator=before.trim()?(before.endsWith("\n")?"\n":"\n\n"):"";
  startAt=start+separator.length;
  nextValue=value.slice(0,start)+separator+suggestion+value.slice(end);
 }
 target.value=nextValue;
 target.dataset.snSuggestionText=suggestion;
 target.dataset.snSuggestionStart=String(startAt);
 try{target.setSelectionRange(startAt+suggestion.length,startAt+suggestion.length);}catch{}
 target.dispatchEvent(new Event("input",{bubbles:true}));
 target.focus();
 const panel=target.parentElement.querySelector(".motivation-suggestions .motivation-options");
 if(panel){
  panel.querySelectorAll("[data-motivation-option]").forEach(button=>{
   const isCurrent=button.dataset.motivationOption===panel.dataset.kind&&button.dataset.motivationIndex===String(suggestion);
   button.setAttribute("aria-pressed",String(isCurrent));
  });
 }
}
function renderTool(tool){if(tool==="tracker"){pendingAutoTrack=true;goView("applications");if(user)autoTrack();return;}if(!tools[tool])tool="cover";activeDraftKey="";activeDraftTitle="";activeTool=tool;const d=tools[tool],number=Object.keys(tools).indexOf(tool)+1;$("toolEyebrow").textContent="TOOL "+String(number).padStart(2,"0")+" / APPLICATION STUDIO";$("toolTitle").textContent=d.title;$("toolDescription").textContent=d.desc;$("toolLargeIcon").textContent=d.icon;$("toolFields").innerHTML=d.fields.map(fieldHTML).join("");document.querySelectorAll(".prepare-tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));$("toolOutput").hidden=true;const defaults={title:valueFrom(["title","opportunity_title"]),institution:valueFrom(["hosting_institution","funding_organization","institution","organization"]),description:cleanOfficialText(valueFrom(["description","job_description","summary"])),url:valueFrom(["application_url","source_url","url"])};Object.keys(defaults).forEach(k=>{const el=$("field-"+k);if(el&&!el.value)el.value=defaults[k];});prefillActiveToolFromProfile();addMotivationSuggestions(tool);goView("prepare");}
function buildProfessionalCoverLetter(v){
 const raw=String(v.profile||"").replace(/\r\n?/g,"\n");
 const sections={other:[]};let current="other";const allLines=[];
 for(const rawLine of raw.split("\n")){
  const line=rawLine.replace(/^\s*(?:(?:[•▪◦●○◆◇■□‣⁃·∙*]+)\s*|\(?\d{1,3}[.)]\s+|[A-Za-z][.)]\s+)/u,"").replace(/[ \t]{2,}/g," ").trim();
  if(!line)continue;
  const heading=line.match(/^(professional summary|experience|research|education|teaching|skills|publications|projects|awards|certifications|languages)\s*:?$/i);
  if(heading){current=heading[1].toLowerCase();if(!sections[current])sections[current]=[];continue;}
  if(/^(?:country\s*\/\s*residency|e-?mail)\s*:/i.test(line)||/^(?:https?:\/\/|www\.)/i.test(line)||/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(line)||/^page\s+\d+(?:\s+of\s+\d+)?$/i.test(line))continue;
  if(!sections[current])sections[current]=[];sections[current].push(line);allLines.push(line);
 }
 const all=allLines.join("\n");
 const sectionText=key=>(sections[key]||[]).join("\n");
 const summary=sectionText("professional summary");
 const descriptions=cleanOfficialText(v.description||"");
 const title=trim(v.title)||"the advertised opportunity",institution=trim(v.institution)||"the host institution",name=trim(v.name)||"[Your full name]",email=trim(v.email);
 const has=re=>re.test(all);
 const hasNano=has(/nanotechnolog|nano[- ]formulation|nanoparticle|drug delivery/i);
 const hasComp=has(/molecular dynamics|molecular simulation|molecular docking|docking|qsar|computer-aided drug design|\bcadd\b|3d[- ]structure prediction|structure prediction/i);
 const hasNetwork=has(/network pharmacology|go\s*\/\s*kegg|pathway enrichment|protein[- ]protein interaction|drug[- ]protein interaction/i);
 const hasAI=has(/machine learning|artificial intelligence|\bai\/ml\b|\bml models?\b/i);
 const hasBioinformatics=has(/bioinformatics|gene ontology|differential gene expression|genomics/i);
 const hasBiochem=has(/biochemistry/i),hasCancer=has(/anticancer|cancer|carcinoma|therapeutic mechanism/i);
 const hasTeaching=has(/teaching assistant|instructed|taught|teaching experience|mentoring|mentor|summer courses|under\/postgraduates/i);
 const hasPhD=/\b(?:ph\.?\s*d\.?|doctorate(?:['’]?s)?\s+degree|doctoral degree)\b/i.test(all);
 const hasMasters=/\bmaster(?:['’]?s)?\s+degree\b|\bmsc\b/i.test(all);
 const yearsMatch=(summary+"\n"+all).match(/\b(\d{1,2}\+?)\s+years?\s+of\s+(?:academic\s+)?(?:teaching\s+and\s+research|research|teaching)\s+experience(?:\s+in\s+([^.\n]+))?/i);
 const paragraphs=[];
 if(yearsMatch){
  paragraphs.push("I bring "+yearsMatch[1]+" years of "+(yearsMatch[0].match(/academic/i)?"academic ":"")+(yearsMatch[0].match(/teaching\s+and\s+research/i)?"teaching and research":yearsMatch[0].match(/teaching/i)?"teaching":"research")+" experience"+(yearsMatch[2]?" across "+yearsMatch[2].replace(/\s+and\s+/i," and "):"")+".");
 }else{
  const identity=hasBiochem?"biochemistry":hasBioinformatics?"bioinformatics and computational biology":"biomedical research";
  paragraphs.push("My background in "+identity+" has developed through research, analytical work and collaboration across related scientific disciplines.");
 }
 const methods=[];
 if(hasNano)methods.push("nanotechnology-based formulation and drug-delivery research");
 if(hasComp)methods.push("computational drug-design methods, including molecular simulation, docking and QSAR");
 if(hasAI)methods.push("machine-learning approaches to biomedical analysis");
 if(hasNetwork)methods.push("network pharmacology and pathway-level analysis");
 if(hasBioinformatics&&!hasNetwork)methods.push("bioinformatics and biological data analysis");
 const roleParts=[];
 if(/\bindependent researcher\b/i.test(all))roleParts.push("independent researcher");
 if(/\bresearch assistant professor\b/i.test(all))roleParts.push("Research Assistant Professor");
 let researchParagraph="";
 const roleDescriptor=roleParts.length===2?"an independent researcher and Research Assistant Professor":roleParts[0]?.toLowerCase()==="independent researcher"?"an independent researcher":roleParts.length?"a Research Assistant Professor":"";
 if(hasNano&&hasComp){
  researchParagraph=(roleDescriptor?"In recent appointments as "+roleDescriptor+", I have ":"My research has ")+(roleDescriptor?"connected":"brought together")+" experimental work on nanotechnology-based formulations and drug delivery with computational drug discovery, including molecular simulation, docking and QSAR.";
 }else if(hasComp){
  researchParagraph=(roleDescriptor?"In recent appointments as "+roleDescriptor+", I have focused on":"My work has focused on")+" computational drug discovery, including molecular simulation, docking and QSAR.";
 }else if(hasNano){
  researchParagraph=(roleDescriptor?"In recent appointments as "+roleDescriptor+", I have worked on":"My research has focused on")+" nanotechnology-based formulations and drug delivery, with an emphasis on their biomedical applications.";
 }else if(methods.length){
  researchParagraph="My research brings together "+methods.slice(0,2).join(" and ")+(methods.length>2?", with further work in "+methods[2]:"")+".";
 }else if(roleDescriptor){
  researchParagraph="In recent appointments as "+roleDescriptor+", I have contributed to independent and collaborative research while developing a broader academic profile.";
 }else{
  researchParagraph="My research experience has strengthened my ability to assess scientific questions carefully, work across related methods and communicate findings to research audiences.";
 }
 if(hasAI)researchParagraph+=" I have also worked with machine-learning models to support biomedical analysis and discovery.";
 if(hasNetwork&&hasCancer)researchParagraph+=" In particular, I have used protein-interaction analysis and GO/KEGG pathway enrichment to investigate potential anticancer mechanisms, connecting computational findings with biologically relevant therapeutic questions.";
 else if(hasNetwork)researchParagraph+=" I have applied network pharmacology and pathway analysis to examine molecular interactions in disease-related research.";
 paragraphs.push(researchParagraph);
 const hasPublication=/published\s+\d+\s+research articles|peer-reviewed|book chapters|publications/i.test(all)||Boolean((sections["publications"]||[]).length);
 const hasReviewer=/reviewed publications|member of reviewers|journal reviewing|peer-reviewed certificate|reviewer(?:s)? committee/i.test(all);
 if(hasPublication||hasReviewer){
  let output="";
  if(hasPublication)output="My work has contributed to peer-reviewed journal articles and book chapters.";
  if(hasReviewer)output+=(output?" ":"")+"I have also served as a manuscript reviewer for scientific journals.";
  output+=" These experiences have strengthened my commitment to rigorous research and clear communication of scientific findings.";
  paragraphs.push(output);
 }
 const education=sectionText("education");
 if(hasPhD){
  let degree="My doctoral training"+(hasBiochem?" in biochemistry":"")+" focused on ";
  degree+=hasComp?"drug-design modelling and molecular simulation":hasNetwork?"computational analysis of biological mechanisms":"research in my scientific discipline";
  degree+=".";
  if(hasMasters&&/oxidative stress|male fertility/i.test(education+"\n"+all))degree+=" My earlier master's research examined oxidative stress and male fertility, giving me additional grounding in mechanistic biomedical research.";
  paragraphs.push(degree);
 }else if(hasMasters){
  paragraphs.push("My master's-level training has given me a foundation in scientific research design, analysis and interpretation that I continue to build on in my work.");
 }
 if(hasTeaching){
  let teaching="Alongside research, I have taught chemistry and biochemistry and contributed to short-course training in drug nano-formulation and in-silico ADMET analysis.";
  if(/mentoring|mentor|under\/postgraduates|guidance/i.test(all))teaching+=" My teaching has also involved guiding and mentoring undergraduate and postgraduate learners.";
  teaching+=" I value the role of clear, supportive teaching in helping students connect scientific concepts with practical research.";
  paragraphs.push(teaching);
 }
 const targets=[];
 if(/translational biomedical|biomedical discovery|biomedical sciences|biomedical applications/i.test(descriptions)&&(/biomedical|therapeutic|cancer|drug delivery|nanotechnolog/i.test(all)))targets.push("translational biomedical research");
 if(/machine learning|artificial intelligence|\bai\/ml\b|ml\/ai/i.test(descriptions)&&hasAI)targets.push("machine-learning approaches to biomedical discovery");
 if(/drug discovery|drug design|drug development/i.test(descriptions)&&(hasComp||/drug discovery|drug design/i.test(all)))targets.push("drug discovery and molecular design");
 if(/chemical biology|proteomics|biophysical chemistry|synthetic chemistry|protein/i.test(descriptions)&&(hasBiochem||hasBioinformatics||hasNetwork))targets.push("molecular and protein-level research");
 const motivation=trim(v.motivation||"").replace(/\s+/g," ").replace(/\.{2,}/g,".").trim();
 const genericMotivation=/^(?:my background|my experience).{0,120}\b(?:aligns?|matches?)\b.{0,100}\b(?:opportunity|role)\b/i.test(motivation);
 const evidenceFocus=[];
 if(hasComp)evidenceFocus.push("computational drug-design methods");
 if(hasNano)evidenceFocus.push("nanotechnology-based biomedical research");
 if(hasAI)evidenceFocus.push("machine-learning analysis");
 let fit="";
 if(targets.length){
  const selectedTargets=targets.slice(0,3);
  const targetText=selectedTargets.length===1?selectedTargets[0]:selectedTargets.length===2?selectedTargets[0]+" and "+selectedTargets[1]:selectedTargets.slice(0,-1).join(", ")+", and "+selectedTargets[selectedTargets.length-1];
  const experienceText=evidenceFocus.length>=2?"my experience combining "+evidenceFocus.slice(0,2).join(" with "):evidenceFocus.length===1?"my background in "+evidenceFocus[0]:"my background in biochemistry and computational analysis";
  fit="The search's emphasis on "+targetText+" aligns closely with "+experienceText+" in support of biomedical research.";
 }else if(evidenceFocus.length){
  fit="I am keen to apply my background in "+evidenceFocus.slice(0,2).join(" and ")+" to this opportunity and contribute to the research priorities of "+institution+".";
 }else{
  fit="I am interested in the opportunity to contribute my research experience to "+title+" at "+institution+".";
 }
 if(motivation&&!genericMotivation&&!/^\[.*\]$/.test(motivation)){
  let polished=motivation;if(!/[.!?]$/.test(polished))polished+=".";paragraphs.push(polished);
 }
 paragraphs.push(fit);
 paragraphs.push("I would welcome the opportunity to discuss how my research experience, scholarly contributions and teaching background could support the work of "+institution+". Thank you for considering my application.");
 const date=new Date().toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
 return name+"\n"+(email?email+"\n":"")+date+"\n\nSelection Committee\n"+institution+"\n\nSubject: Application for "+title+"\n\nDear Selection Committee,\n\n"+paragraphs.filter(Boolean).join("\n\n")+"\n\nYours sincerely,\n"+name;
}
function makeDraft(tool,v){const title=v.title||"the advertised opportunity",institution=v.institution||"the host organization",name=v.name||"[Your name]",profileText=v.profile||"[Add your accurate qualifications and evidence]",description=cleanOfficialText(v.description||"[Insert specific criteria from the official listing]"),motivation=v.motivation||v.goals||"[Explain your genuine motivation and goals]",today=new Date().toLocaleDateString();
if(tool==="cover")return buildProfessionalCoverLetter(v);
if(tool==="cv")return "CV TAILORING REVIEW — "+title+"\n\nTARGET CRITERIA\n"+description+"\n\nCURRENT EXPERIENCE / EVIDENCE\n"+profileText+"\n\nSUGGESTED REVIEW CHECKLIST\n1. Move the most relevant, accurate experience and skills toward the top.\n2. Match terminology to criteria only where it describes your real experience.\n3. Strengthen bullets using action + scope + outcome; include numbers only when true.\n4. Include publications, methods, teaching, grants or leadership only when supported by your record.\n5. Reduce unrelated detail if it obscures fit while preserving dates and credentials.\n6. Check required format, page limit and attachments in the official call.\n\nPRIORITY EMPHASIS\n"+(v.target||"[Specify the most important criteria]")+"\n\nThis is a review framework, not an automatically verified CV. Do not add experience or skills you cannot substantiate.";
if(tool==="eligibility"){const patterns=[["Degree / qualification",/ph\.?d\.?|doctorate|master'?s|bachelor'?s|degree|qualification/i],["Experience",/years? of experience|experience|postdoctoral|teaching experience/i],["Deadline",/deadline|apply by|applications? (?:close|due)|closing date/i],["Required documents",/cv|resume|cover letter|motivation letter|statement of purpose|research statement|transcript|recommendation|reference letter/i],["Eligibility / residency",/citizen|citizenship|resident|residency|eligible|eligibility|international applicants/i],["Research / subject fit",/research|discipline|field of study|speciali[sz]ation|subject area/i],["Funding / salary",/funded|funding|stipend|salary|tuition|benefit/i],["Submission route",/apply online|application portal|submit|application form/i]];const found=patterns.filter(p=>p[1].test(description)).map(p=>p[0]);return "ELIGIBILITY & REQUIREMENTS REVIEW — "+title+"\n\nLISTING REVIEW CHECKLIST\n"+(found.length?found.map((x,i)=>(i+1)+". [ ] "+x+" — verify the exact rule and your evidence in the official call.").join("\n"):"No common requirement patterns detected. Manually review the complete official listing.")+"\n\nYOUR QUALIFICATIONS / EVIDENCE\n"+profileText+"\n\nOFFICIAL OPPORTUNITY TEXT\n"+description+"\n\nIMPORTANT: This is keyword-assisted extraction, not an eligibility decision. Confirm nationality/residency, degree dates, age limits, exclusions, funding conditions, document specifications and deadline directly with the provider.";}
if(tool==="email"){const purpose=v.purpose||"application",subject=purpose==="supervisor"?"Prospective research opportunity inquiry":purpose==="referee"?"Request for a recommendation letter":purpose==="followup"?"Follow-up regarding "+title:"Inquiry regarding "+title;const extra=purpose==="referee"?"Would you feel comfortable providing a recommendation based on your knowledge of my work? I can share my CV, the opportunity description, deadline and relevant project details.":purpose==="followup"?"I am writing to politely follow up on my previous message. I understand you have many commitments, and I appreciate your time.":purpose==="supervisor"?"If my background aligns with your current work, I would be grateful to know whether you may be considering students or researchers in this area.":"Could you please advise on the next steps or clarify any relevant requirements?";return "Subject: "+subject+"\n\nDear "+(v.recipient||"Professor / Dr [Surname]")+",\n\nI hope you are well. My name is "+name+", and I am contacting you regarding "+title+" at "+institution+".\n\n"+(v.description||"I would appreciate your guidance regarding this opportunity and its application requirements.")+"\n\nMy relevant background includes:\n"+profileText+"\n\n"+extra+"\n\nThank you for your time and consideration.\n\nKind regards,\n"+name+"\n[Contact information]";}
const kind=v.kind||"sop",label=({sop:"STATEMENT OF PURPOSE",research:"RESEARCH STATEMENT",teaching:"TEACHING STATEMENT",intent:"LETTER OF INTENT",personal:"PERSONAL STATEMENT",career:"CAREER GOALS STATEMENT"})[kind]||"ACADEMIC STATEMENT";return label+"\n"+name+"\n"+title+" — "+institution+"\n\n1. PURPOSE AND FIT\nExplain why this opportunity and institution are a strong match, referring to official aims and selection criteria.\n\n"+description+"\n\n2. RELEVANT EXPERIENCE AND EVIDENCE\n"+profileText+"\n\n3. INTERESTS, APPROACH AND CONTRIBUTION\n"+motivation+"\n\n4. FUTURE GOALS\nDescribe realistic short- and long-term goals and how this opportunity supports them.\n\n5. CONCLUSION\nSummarize fit and intended contribution in a concise closing paragraph.\n\n[Draft scaffold only. Replace generic sections with truthful examples, observe word limits and remove sections the provider did not request.]";}
function generate(e){e.preventDefault();const output=makeDraft(activeTool,vals());$("outputText").value=output;$("outputTitle").textContent=activeTool==="eligibility"?"Requirements checklist":"Editable "+tools[activeTool].title.toLowerCase();$("toolOutput").hidden=false;status("draftSaveStatus","");$("toolOutput").scrollIntoView({behavior:"smooth",block:"start"});}
async function persistApplication(record){
 if(!requireReady()||!requireUser())return null;
 if(!trim(record.title)){toast("Add an opportunity title first.",true);return null;}
 const ownerId=user.id;
 const payload={user_id:ownerId,opportunity_key:(trim(record.opportunity_key)||oppKey(null)).slice(0,450),title:trim(record.title).slice(0,500),institution:trim(record.institution).slice(0,300)||null,deadline:safeDeadline(record.deadline),official_url:trim(record.official_url).slice(0,2000)||null,status:statusLabels[record.status]?record.status:"interested",notes:trim(record.notes).slice(0,12000)||null,updated_at:new Date().toISOString()};
 const {data,error}=await db.from("applications").upsert(payload,{onConflict:"user_id,opportunity_key"}).select().single();
 if(!user||user.id!==ownerId)return null;
 if(error){toast("Could not save application: "+error.message,true);return null;}
 await loadApps();
 if(!user||user.id!==ownerId)return null;
 toast("Application saved to your account.");return data;
}
async function autoTrack(){if(!pendingAutoTrack||!user||!selected)return;pendingAutoTrack=false;const r=currentOpportunity();if(r.title)await persistApplication(r);else toast("Open an opportunity from the listings first.",true);}
async function saveSelected(){if(!selected){goView("applications");$("manualAppForm").hidden=false;toast("Add the opportunity details in the tracker.");return;}const saved=await persistApplication(currentOpportunity());if(saved)goView("applications");}
async function saveDraft(){
 if(!requireReady()||!requireUser())return;
 const ownerId=user.id,content=trim($("outputText").value);
 if(!content){toast("Generate or enter a draft first.",true);return;}
 const v=vals(),title=trim(v.title||activeDraftTitle||currentOpportunity().title||tools[activeTool].title),key=activeDraftKey||(oppKey(selected)||("manual:"+activeTool));
 const payload={user_id:ownerId,opportunity_key:key.slice(0,450),tool:activeTool,title:title.slice(0,500),content:content.slice(0,60000),updated_at:new Date().toISOString()};
 const {error}=await db.from("drafts").upsert(payload,{onConflict:"user_id,tool,opportunity_key"});
 if(!user||user.id!==ownerId)return;
 if(error){status("draftSaveStatus","Could not save draft: "+error.message,"error");return;}
 status("draftSaveStatus","Draft saved to your signed-in account.","success");activeDraftTitle=title;toast("Draft saved to your account.");await loadDrafts();
}
async function loadApps(){
 if(!user||!db)return;
 const ownerId=user.id;
 const {data,error}=await db.from("applications").select("*").eq("user_id",ownerId).order("deadline",{ascending:true,nullsFirst:false}).order("updated_at",{ascending:false});
 if(!user||user.id!==ownerId)return;
 if(error){const missing=/PGRST205|schema cache|could not find the table|relation .*applications.* does not exist/i.test((error.code||"")+" "+(error.message||""));toast(missing?"The application tracker table is missing from this Supabase project. Run the complete supabase/schema.sql (not only fix-cv-storage.sql) in this project’s SQL Editor, then reload the schema cache with NOTIFY pgrst, 'reload schema';.":"Could not load tracker: "+error.message,true);return;}
 apps=data||[];renderApps();updateStats();await loadDrafts();
}
async function loadDrafts(){
 if(!user||!db)return;
 const ownerId=user.id;
 const {data,error}=await db.from("drafts").select("*").eq("user_id",ownerId).order("updated_at",{ascending:false});
 if(!user||user.id!==ownerId)return;
 if(error){toast("Could not load saved drafts: "+error.message,true);return;}
 drafts=data||[];renderDrafts();
}
function renderDrafts(){const box=$("savedDraftsList");if(!box)return;$("draftCount").textContent=drafts.length;box.innerHTML=drafts.length?drafts.map(d=>'<article class="saved-draft-row"><div class="saved-draft-copy"><strong>'+esc(d.title||"Untitled draft")+'</strong><small>'+esc((tools[d.tool]?.title||d.tool)+" · Updated "+new Date(d.updated_at||d.created_at).toLocaleDateString())+'</small></div><div class="saved-draft-actions"><button type="button" data-open-draft="'+esc(d.id)+'">Continue editing</button><button type="button" data-delete-draft="'+esc(d.id)+'">Delete</button></div></article>').join(""):'<p class="empty-note">'+(user?"No saved drafts yet. Generate a draft and choose Save to my account.":"Sign in to view drafts saved to your account.")+'</p>';}
function openDraft(id){const draft=drafts.find(d=>String(d.id)===String(id));if(!draft)return;renderTool(draft.tool);activeDraftKey=draft.opportunity_key;activeDraftTitle=draft.title||"";$("outputText").value=draft.content||"";$("outputTitle").textContent="Saved "+(tools[draft.tool]?.title||"application")+" draft";$("toolOutput").hidden=false;status("draftSaveStatus","Loaded saved draft. Continue editing, then save your changes.");$("toolOutput").scrollIntoView({behavior:"smooth",block:"start"});}
async function deleteDraft(id){
 if(!requireUser()||!confirm("Delete this saved draft from your account?"))return;
 const ownerId=user.id;
 const {error}=await db.from("drafts").delete().eq("user_id",ownerId).eq("id",id);
 if(!user||user.id!==ownerId)return;
 if(error){toast("Could not delete draft: "+error.message,true);return;}
 await loadDrafts();toast("Draft deleted.");
}
function renderApps(){const q=trim($("applicationSearch").value).toLowerCase(),f=trim($("applicationStatusFilter").value),rows=apps.filter(a=>(!f||a.status===f)&&(!q||(a.title+" "+(a.institution||"")).toLowerCase().includes(q)));$("navAppCount").textContent=apps.length;$("applicationsList").innerHTML=rows.length?rows.map(a=>'<article class="application-row"><div><div class="application-statusline"><span class="status-pill status-'+esc(a.status)+'">'+esc(statusLabels[a.status]||a.status)+'</span>'+(a.deadline?'<span class="status-pill">'+(a.deadline<new Date().toISOString().slice(0,10)?"Deadline passed":"Deadline "+esc(a.deadline))+'</span>':"")+'</div><h3>'+esc(a.title)+'</h3><p>'+esc(a.institution||"Institution not specified")+'</p><div class="application-meta"><small>Updated '+esc(new Date(a.updated_at||a.created_at).toLocaleDateString())+'</small>'+(safeHTTP(a.official_url)?'<a href="'+esc(safeHTTP(a.official_url))+'" target="_blank" rel="noopener">Official listing ↗</a>':"")+'</div></div><div class="application-row-actions"><label class="sr-only" for="appstatus-'+esc(a.id)+'">Application status</label><select id="appstatus-'+esc(a.id)+'" data-app-status="'+esc(a.id)+'">'+Object.entries(statusLabels).map(([k,v])=>'<option value="'+k+'" '+(a.status===k?"selected":"")+'>'+v+'</option>').join("")+'</select><button data-edit-app="'+esc(a.id)+'" type="button">Edit notes</button><button data-remove-app="'+esc(a.id)+'" type="button">Remove</button></div></article>').join(""):'<div class="empty-state"><span>▣</span><h3>'+(user?"No matching applications yet.":"Sign in to open your personal tracker.")+'</h3><p>'+(user?"Use Apply with Scholar News or add an application manually.":"Your tracker is private and linked to your student account.")+'</p><button class="desk-primary" data-view="'+(user?"dashboard":"account")+'">'+(user?"Back to workspace":"Sign in / create account")+" →</button></div>";}
function updateStats(){const today=new Date().toISOString().slice(0,10);$("statApplicationCount").textContent=apps.length;$("statSubmittedCount").textContent=apps.filter(a=>["submitted","interview","offer"].includes(a.status)).length;$("statUpcomingCount").textContent=apps.filter(a=>a.deadline&&a.deadline>=today&&!["submitted","offer","rejected","withdrawn"].includes(a.status)).length;}
async function updateAppStatus(id,next){
 if(!requireUser())return;const ownerId=user.id;
 const {error}=await db.from("applications").update({status:next,updated_at:new Date().toISOString()}).eq("user_id",ownerId).eq("id",id);
 if(!user||user.id!==ownerId)return;
 if(error){toast("Status not updated: "+error.message,true);return;}
 await loadApps();toast("Application status updated.");
}
async function removeApp(id){
 if(!requireUser()||!confirm("Remove this application from your tracker? This does not contact the host institution."))return;const ownerId=user.id;
 const {error}=await db.from("applications").delete().eq("user_id",ownerId).eq("id",id);
 if(!user||user.id!==ownerId)return;
 if(error){toast("Could not remove application: "+error.message,true);return;}
 await loadApps();toast("Application removed.");
}
async function editNotes(id){
 if(!requireUser())return;
 const ownerId=user.id,a=apps.find(x=>x.id===id&&x.user_id===ownerId);if(!a)return;
 const notes=prompt("Private notes for "+a.title+":",a.notes||"");if(notes===null)return;
 const {error}=await db.from("applications").update({notes:notes,updated_at:new Date().toISOString()}).eq("user_id",ownerId).eq("id",id);
 if(!user||user.id!==ownerId)return;
 if(error)toast("Could not save notes: "+error.message,true);else{await loadApps();toast("Notes saved.");}
}
async function loadProfile(force=false){
 if(!user||!db)return;
 const ownerId=user.id;
 const {data,error}=await db.from("profiles").select("*").eq("user_id",ownerId).maybeSingle();
 if(!user||user.id!==ownerId)return;
 if(error){status("profileSaveStatus","Could not load profile: "+error.message,"error");return;}
 profile=data||{};
 if(profile.cv_text){
  const facts=guessCVFacts(profile.cv_text);
  const cleaned=cleanExtractedCVText(profile.cv_text);
  const patch={};
  if(cleaned!==profile.cv_text)patch.cv_text=cleaned;
  if(!trim(profile.country)&&facts.country)patch.country=facts.country;
  if(Object.keys(patch).length){
   const {error:patchError}=await db.from("profiles").update({...patch,updated_at:new Date().toISOString()}).eq("user_id",ownerId);
   if(!user||user.id!==ownerId)return;
   profile={...profile,...patch};
   if(patchError)console.warn("Could not persist cleaned CV text/profile country",patchError.message);
  }
 }
 const map={profileName:"full_name",profileEmail:"email",profileCountry:"country",profileInstitution:"institution",profileLevel:"education_level",profileDiscipline:"discipline",profileCVText:"cv_text"};
 Object.entries(map).forEach(([id,key])=>{if(force||document.activeElement!==$(id))$(id).value=profile[key]||"";});
 if(force||!$("profileEmail").value)$("profileEmail").value=profile.email||user.email||"";
 await loadCVFiles();
 if(!user||user.id!==ownerId)return;
 prefillActiveToolFromProfile();
}
async function saveProfile(e){
 e.preventDefault();if(!requireReady()||!requireUser())return;
 const ownerId=user.id;
 const payload={user_id:ownerId,email:(trim($("profileEmail").value)||profile.email||user.email).slice(0,320),full_name:trim($("profileName").value).slice(0,200),country:trim($("profileCountry").value).slice(0,120),institution:trim($("profileInstitution").value).slice(0,300),education_level:trim($("profileLevel").value).slice(0,100),discipline:trim($("profileDiscipline").value).slice(0,300),cv_text:trim($("profileCVText").value),updated_at:new Date().toISOString()};
 const {error}=await db.from("profiles").upsert(payload);
 if(!user||user.id!==ownerId)return;
 if(error){status("profileSaveStatus","Could not save profile: "+error.message,"error");return;}
 profile=payload;status("profileSaveStatus","Your profile is saved to this account.","success");toast("Profile saved.");
}
function safeFileName(name){return trim(name).replace(/[^a-z0-9._-]/gi,"-").slice(0,90)||"cv";}
async function uploadCV(e){
 e.preventDefault();if(!requireReady()||!requireUser())return;
 const ownerId=user.id;
 const file=$("cvFile").files[0];if(!file){status("cvUploadStatus","Choose a CV file first.","error");return;}
 if(file.size>10*1024*1024){status("cvUploadStatus","This file is larger than 10 MB.","error");return;}
 const ext=(file.name.split(".").pop()||"").toLowerCase();
 if(!["pdf","doc","docx"].includes(ext)){status("cvUploadStatus","Use a PDF, DOC or DOCX file.","error");return;}
 let extractedText="",extractError="";
 if(ext==="pdf"||ext==="docx"){
  status("cvUploadStatus","Reading CV text locally in your browser…");
  try{extractedText=await extractCVTextFromFile(file,ext);if(!extractedText)throw new Error("No readable text was found.");}
  catch(error){extractError=error.message||"Text extraction failed.";}
 }else extractError="Legacy .doc files can be uploaded privately, but automatic extraction requires PDF or DOCX. Save a copy as PDF or DOCX and upload that copy to extract it.";
 if(!user||user.id!==ownerId)return;
 const path=ownerId+"/"+Date.now()+"-"+safeFileName(file.name);
 status("cvUploadStatus","Uploading your CV to private storage…");
 const {error:upErr}=await db.storage.from("student-cvs").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
 if(!user||user.id!==ownerId)return;
 if(upErr){
  const msg=/bucket.*not.*found|not found.*bucket/i.test(upErr.message||"")?"CV storage bucket is missing. Run supabase/fix-cv-storage.sql in this Supabase project; keep the bucket private.":/mime|content type|not allowed/i.test(upErr.message||"")?"This file type is not allowed by the storage bucket. Check its allowed MIME types in Supabase Storage.":"Upload failed: "+upErr.message;
  status("cvUploadStatus",msg,"error");return;
 }
 const {error:recErr}=await db.from("cv_files").insert({user_id:ownerId,storage_path:path,original_filename:file.name.slice(0,255),content_type:file.type||"application/octet-stream",size_bytes:file.size});
 if(!user||user.id!==ownerId)return;
 if(recErr){await db.storage.from("student-cvs").remove([path]);status("cvUploadStatus","File record could not be saved: "+recErr.message,"error");return;}
 $("cvFile").value="";
 let profileSaveError=null;
 if(extractedText){
  const facts=guessCVFacts(extractedText);
  const cleanedText=cleanExtractedCVText(extractedText);
  fillBlankProfileInputs(facts);
  profileSaveError=await saveExtractedCVToProfile(cleanedText,facts,ownerId);
  if(!user||user.id!==ownerId)return;
  if(profileSaveError){
   status("profileSaveStatus","CV text was extracted, but saving it to your profile failed: "+profileSaveError.message+". Review the CV text and click Save my profile.","error");
   status("cvUploadStatus","CV uploaded privately and text extracted, but it could not be synced to your profile. The cleaned text is available in the CV text field for review.","error");
  }else{
   status("profileSaveStatus","CV text and suggested details saved to this account. Review the detected name, country/residency, education, institution and field below; edit anything inaccurate before generating documents.","success");
   status("cvUploadStatus","CV uploaded privately. Cleaned text and detected country/residency saved to this account; application documents will now prefill from it. Check all generated details before use.","success");
  }
 }else{
  status("cvUploadStatus","CV uploaded privately, but automatic text extraction was not completed: "+extractError,"error");
 }
 await loadCVFiles();
 if(!user||user.id!==ownerId)return;
 if(extractedText){
  $("profileCVText").scrollIntoView({behavior:"smooth",block:"center"});
  toast(profileSaveError?"CV text extracted; please save it to your profile.":"CV uploaded and this account's reusable profile updated.");
 }else toast("CV uploaded to private storage.");
}async function loadCVFiles(){
 if(!user||!db)return;
 const ownerId=user.id;
 const {data,error}=await db.from("cv_files").select("*").eq("user_id",ownerId).order("uploaded_at",{ascending:false});
 if(!user||user.id!==ownerId)return;
 if(error){status("cvUploadStatus","Could not list CV files: "+error.message,"error");return;}
 cvFiles=data||[];
 $("cvFileCount").textContent=cvFiles.length;
 $("cvFileList").innerHTML=cvFiles.length?cvFiles.map(f=>'<div class="cv-file-row"><div class="cv-file-meta"><strong title="'+esc(f.original_filename)+'">'+esc(f.original_filename)+'</strong><small>'+esc((f.size_bytes/1024/1024).toFixed(2))+' MB · '+esc(new Date(f.uploaded_at).toLocaleDateString())+'</small></div><button data-cv-download="'+esc(f.storage_path)+'" type="button">Download</button><button data-cv-delete="'+esc(f.storage_path)+'" type="button">Delete</button></div>').join(""):'<p class="empty-note">No CV files saved yet. Upload a PDF, DOC or DOCX to keep a private copy.</p>';
}
async function downloadCV(path){
 if(!requireUser())return;
 if(!String(path||"").startsWith(user.id+"/")){toast("This CV file does not belong to the signed-in account.",true);return;}
 const {data,error}=await db.storage.from("student-cvs").createSignedUrl(path,60);
 if(!user||!path.startsWith(user.id+"/"))return;
 if(error){toast("Cannot create private download link: "+error.message,true);return;}
 window.open(data.signedUrl,"_blank","noopener");
}
async function deleteCV(path){
 if(!requireUser()||!confirm("Delete this CV file from your private vault?"))return;
 const ownerId=user.id;
 if(!String(path||"").startsWith(ownerId+"/")){toast("This CV file does not belong to the signed-in account.",true);return;}
 const {error:e1}=await db.storage.from("student-cvs").remove([path]);
 if(!user||user.id!==ownerId)return;
 if(e1){toast("File could not be deleted: "+e1.message,true);return;}
 const {error:e2}=await db.from("cv_files").delete().eq("user_id",ownerId).eq("storage_path",path);
 if(!user||user.id!==ownerId)return;
 if(e2){toast("CV record could not be removed: "+e2.message,true);return;}
 await loadCVFiles();toast("CV file deleted.");
}
function syncAuth(){
 const signed=Boolean(user);
 $("passwordRecovery").hidden=!recoveryMode;
 $("authSignedIn").hidden=!signed||recoveryMode;
 $("authSignedOut").hidden=signed||recoveryMode;
 $("accountNavButton").hidden=signed&&!recoveryMode;
 $("accountNavButton").textContent=signed?"My account":"Sign in";
 $("deskAccountMenuWrap").hidden=!signed||recoveryMode;
 if(signed){
  const displayName=profile.full_name||user.user_metadata?.full_name||user.email||"Student account";
  $("deskAccountMenuName").textContent=displayName;
  $("deskAccountMenuEmail").textContent=user.email||"";
  $("deskAccountMenuAvatar").textContent=trim(displayName).charAt(0).toUpperCase()||"S";
 }
 $("connectionStatus").innerHTML='<i></i> '+(signed?"Signed in":isReady()?"Not signed in":"Account setup needed");
 $("connectionStatus").classList.toggle("ready",signed);
 $("connectionStatus").classList.toggle("offline",!isReady());
 $("authSetupInline").hidden=isReady();$("setupNotice").hidden=isReady();
 if(recoveryMode){$("deskAccountMenuPopover").hidden=true;return;}
 if(signed){$("signedInName").textContent=profile.full_name||user.user_metadata?.full_name||"Your account";$("signedInEmail").textContent=user.email||"";$("userGreeting").textContent="Welcome back"+(profile.full_name?" "+profile.full_name.split(/\s+/)[0]:"")+". Ready for your next move?";}
 else{$("userGreeting").textContent="A clearer path to your next move.";$("deskAccountMenuPopover").hidden=true;}
}
async function onAuthChanged(nextUser){
 const incoming=nextUser||null;
 const previousId=user?.id||"",nextId=incoming?.id||"";
 const accountChanged=previousId!==nextId;
 const generation=++sessionGeneration;
 user=incoming;
 if(previousId&&accountChanged)clearPrivateWorkspaceUI();
 if(!user){
  apps=[];drafts=[];profile={};cvFiles=[];
  renderApps();renderDrafts();updateStats();syncAuth();
  return;
 }
 await loadProfile(accountChanged);
 if(generation!==sessionGeneration||!user||user.id!==nextId)return;
 await loadApps();
 if(generation!==sessionGeneration||!user||user.id!==nextId)return;
 syncAuth();
 if(pendingAutoTrack)await autoTrack();
}
function clearPrivateWorkspaceUI(){
 profile={};apps=[];drafts=[];cvFiles=[];
 const profileIds=["profileName","profileEmail","profileCountry","profileInstitution","profileLevel","profileDiscipline","profileCVText"];
 profileIds.forEach(id=>{const el=$(id);if(el)el.value="";});
 if($("profileForm"))$("profileForm").reset();
 $("cvFileCount").textContent="0";
 $("cvFileList").innerHTML='<p class="empty-note">Sign in to view your private CV files.</p>';
 $("cvFile").value="";
 ["profileSaveStatus","cvUploadStatus"].forEach(id=>{if($(id))$(id).textContent="";});
 if($("toolFields"))$("toolFields").querySelectorAll("input,textarea,select").forEach(el=>{if(el.tagName==="SELECT")el.selectedIndex=0;else el.value="";delete el.dataset.snSuggestionText;delete el.dataset.snSuggestionStart;});
 if($("outputText"))$("outputText").value="";
 if($("toolOutput"))$("toolOutput").hidden=true;
 if($("deskAccountMenuPopover"))$("deskAccountMenuPopover").hidden=true;
 if($("deskAccountMenuToggle"))$("deskAccountMenuToggle").setAttribute("aria-expanded","false");
 renderApps();renderDrafts();updateStats();
}
function authErrorMessage(error){
 const message=trim(error&&error.message||error)||"The authentication request failed.";
 const lower=message.toLowerCase();
 if(lower.includes("email not confirmed")||lower.includes("email_not_confirmed")||lower.includes("email confirmation")){
  return "This account was created but its email address has not been confirmed yet. Open the confirmation email, or use “Resend confirmation email” below. If no email arrives, check Supabase Authentication settings and configure a trusted SMTP sender.";
 }
 if(lower.includes("email rate limit exceeded")||(/rate.?limit/.test(lower)&&lower.includes("email"))||lower.includes("too many requests"))
  return "Supabase has temporarily rate-limited authentication emails. Please stop retrying and wait for the limit to reset. For reliable email delivery, configure a custom SMTP provider in Supabase Authentication settings. If you already have an account, use Sign in instead of creating another one.";
 if(lower.includes("redirect")&&(/url|allow|whitelist/.test(lower)))
  return "Supabase rejected the redirect URL. In Authentication → URL Configuration, allow "+location.origin+"/premium/ and try again.";
 if(lower.includes("invalid login credentials"))
  return "Email or password is incorrect. Check for typos; if the account was just created, it may still need email confirmation. Use Forgot password? if you have forgotten the password.";
 if(lower.includes("user already registered")||lower.includes("already been registered"))
  return "An account may already exist for this email. Switch to Sign in or use Forgot password? rather than registering again.";
 if(lower.includes("expired")||lower.includes("invalid token")||lower.includes("otp"))
  return "This password-reset link is invalid or expired. Request one new reset email and open its latest link.";
 return message;
}
async function authSubmit(e){
 e.preventDefault();if(!requireReady())return;
 const email=trim($("authEmail").value),password=$("authPassword").value;
 if(!email){status("authStatus","Enter your email address first.","error");return;}
 if(password.length<8){status("authStatus","Use a password with at least 8 characters.","error");return;}
 const button=$("authSubmit");button.disabled=true;
 $("resendConfirmationButton").hidden=true;
 status("authStatus",authMode==="signup"?"Creating your account…":"Signing in…");
 try{
  const result=authMode==="signup"
   ?await db.auth.signUp({email,password,options:{data:{full_name:trim($("authName").value)},emailRedirectTo:new URL("./",location.href).href}})
   :await db.auth.signInWithPassword({email,password});
  if(result.error){
   const lower=String(result.error.message||"").toLowerCase();
   if(lower.includes("email not confirmed")||lower.includes("email_not_confirmed"))$("resendConfirmationButton").hidden=false;
   status("authStatus",authErrorMessage(result.error),"error");return;
  }
  if(authMode==="signup"&&!result.data.session){
   const {data:sessionData}=await db.auth.getSession();
   if(sessionData?.session)await db.auth.signOut();
   await onAuthChanged(null);
   $("resendConfirmationButton").hidden=false;
   status("authStatus","Your account was created in Supabase, but sign-in is not available until email confirmation is completed. Check your inbox/spam folder, or click “Resend confirmation email” below. If emails do not arrive, review Supabase Authentication → Email/SMTP settings.","success");
   return;
  }
  if(!result.data.user){status("authStatus","Supabase did not return a user for this request. Please retry sign-in, or check the account status in Supabase Authentication.","error");return;}
  $("resendConfirmationButton").hidden=true;
  await onAuthChanged(result.data.user);
  status("authStatus","Signed in successfully.","success");goView("dashboard");
  toast(authMode==="signup"?"Welcome to Scholar News.":"Welcome back.");
 }catch(error){status("authStatus",authErrorMessage(error),"error");}
 finally{button.disabled=false;}
}
async function resetPassword(){
 if(!requireReady())return;
 const email=trim($("authEmail").value);
 if(!email){status("authStatus","Enter your account email address in the Email address field first.","error");$("authEmail").focus();return;}
 const button=$("forgotPassword");button.disabled=true;status("authStatus","Requesting a password-reset email…");
 try{
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:new URL("./",location.href).href});
  if(error){status("authStatus",authErrorMessage(error),"error");return;}
  status("authStatus","If this email belongs to an account, Supabase will send a reset link. Check your inbox and spam folder. Open the newest link on this same website. Do not keep requesting emails; provider rate limits may temporarily block delivery.","success");
 }catch(error){status("authStatus",authErrorMessage(error),"error");}
 finally{button.disabled=false;}
}
async function changePassword(e){
 e.preventDefault();if(!requireReady())return;
 const password=$("recoveryPassword").value;
 if(password.length<8){status("recoveryStatus","Use a password with at least 8 characters.","error");return;}
 const button=e.submitter||$("recoveryForm").querySelector('button[type="submit"]');if(button)button.disabled=true;
 status("recoveryStatus","Updating your password…");
 try{
  const {data,error}=await db.auth.updateUser({password});
  if(error){status("recoveryStatus",authErrorMessage(error),"error");return;}
  recoveryMode=false;$("recoveryForm").reset();
  await onAuthChanged(data.user||user);syncAuth();goView("account");
  status("authStatus","Password updated. Your new password is ready to use.","success");toast("Password updated successfully.");
 }catch(error){status("recoveryStatus",authErrorMessage(error),"error");}
 finally{if(button)button.disabled=false;}
}
async function cancelPasswordRecovery(){
 recoveryMode=false;
 try{if(db)await db.auth.signOut();}catch{}
 await onAuthChanged(null);syncAuth();goView("account");
 status("authStatus","Password reset cancelled. You can sign in or request a new reset link.","success");
}
async function resendSignupConfirmation(){
 if(!requireReady())return;
 const email=trim($("authEmail").value);
 if(!email){status("authStatus","Enter the email address used to create your account first.","error");$("authEmail").focus();return;}
 const button=$("resendConfirmationButton");button.disabled=true;status("authStatus","Requesting a confirmation email…");
 try{
  const {error}=await db.auth.resend({type:"signup",email,options:{emailRedirectTo:new URL("./",location.href).href}});
  if(error){status("authStatus",authErrorMessage(error),"error");return;}
  status("authStatus","If the account still needs confirmation, Supabase has been asked to send a new confirmation email. Check your inbox and spam folder. If no message arrives, verify your Supabase Site URL/Redirect URLs and configure SMTP. Avoid repeated requests because of rate limits.","success");
 }catch(error){status("authStatus",authErrorMessage(error),"error");}
 finally{button.disabled=false;}
}
async function signOutUser(){
 if(!db)return;
 const {error}=await db.auth.signOut();
 if(error){toast(error.message,true);return;}
 await onAuthChanged(null);recoveryMode=false;goView("dashboard");toast("You have signed out.");
}
function changeAuth(mode){authMode=mode==="signup"?"signup":"signin";$("resendConfirmationButton").hidden=true;document.querySelectorAll("[data-auth-mode]").forEach(b=>b.classList.toggle("active",b.dataset.authMode===authMode));$("authTitle").textContent=authMode==="signup"?"Create your student account.":"Welcome back.";$("authIntro").textContent=authMode==="signup"?"Create an account to keep your private CV and application records together.":"Sign in to continue with your application workspace.";$("authNameWrap").hidden=authMode!=="signup";$("authSubmit").textContent=!isReady()?"Account setup required":(authMode==="signup"?"Create account →":"Sign in securely →");$("authPassword").autocomplete=authMode==="signup"?"new-password":"current-password";status("authStatus",isReady()?"":"The account service has not been configured, so real sign-up and sign-in cannot run yet. Open the setup guide below.","error");}
function initAuth(){if(!isReady()){$("setupNotice").hidden=false;$("authSetupInline").hidden=false;$("connectionStatus").innerHTML="<i></i> Account setup needed";$("connectionStatus").classList.add("offline");$("authSubmit").disabled=false;$("authSubmit").title="Account creation requires Supabase configuration; see SETUP.md";status("authStatus","Real account creation is not active yet. Configure the Supabase project URL and public key using the setup guide below, then reload this page.","error");return;}db=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});db.auth.onAuthStateChange((event,session)=>{setTimeout(async()=>{if(event==="PASSWORD_RECOVERY")recoveryMode=true;try{await onAuthChanged(session?.user||null);if(event==="PASSWORD_RECOVERY"){recoveryMode=true;syncAuth();goView("account");status("recoveryStatus","Reset link verified. Choose a new password below.","success");}}catch(e){toast(e.message||"Account session could not be loaded.",true);}},0);});db.auth.getSession().then(({data,error})=>{if(error)toast(error.message,true);return onAuthChanged(data.session?.user||null);}).catch(e=>toast("Account connection failed: "+e.message,true));}
function bind(){ $("toolFields").addEventListener("click",event=>{
 const option=event.target.closest("[data-motivation-option]");
 if(option){
  const target=$("field-"+(activeTool==="statement"?"goals":"motivation"));
  if(!target)return;
  const suggestion=buildMotivationSuggestion(option.dataset.motivationOption,Number(option.dataset.motivationIndex));
  useMotivationSuggestion(target,suggestion);
  const panel=option.closest(".motivation-options");
  if(panel)panel.querySelectorAll("[data-motivation-option]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.motivationOption===option.dataset.motivationOption&&button.dataset.motivationIndex===option.dataset.motivationIndex)));
  return;
 }
 const button=event.target.closest("[data-motivation-suggestion]");
 if(!button)return;
 const wrap=button.closest(".motivation-suggestions");
 if(!wrap)return;
 const panel=wrap.querySelector(".motivation-options");
 if(panel&&!panel.hidden&&panel.dataset.kind===button.dataset.motivationSuggestion){
  panel.hidden=true;button.classList.remove("active");button.setAttribute("aria-expanded","false");return;
 }
 renderMotivationOptions(wrap,button.dataset.motivationSuggestion);
});document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{goView(b.dataset.view);const menu=$("deskAccountMenuPopover");if(menu)menu.hidden=true;const toggle=$("deskAccountMenuToggle");if(toggle)toggle.setAttribute("aria-expanded","false");}));document.querySelectorAll("[data-tool]").forEach(b=>b.addEventListener("click",()=>renderTool(b.dataset.tool)));$("toolForm").addEventListener("submit",generate);$("saveDraftButton").addEventListener("click",saveDraft);$("trackCurrentButton").addEventListener("click",saveSelected);$("copyDraftButton").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("outputText").value);toast("Draft copied.");}catch{$("outputText").select();toast("Select the text and copy it manually.");}});$("downloadDraftButton").addEventListener("click",()=>{const blob=new Blob([$("outputText").value],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=safeFileName(($("field-title")?.value||activeTool)+"-scholar-news-draft")+".txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});$("authForm").addEventListener("submit",authSubmit);document.querySelectorAll("[data-auth-mode]").forEach(b=>b.addEventListener("click",()=>changeAuth(b.dataset.authMode)));$("forgotPassword").addEventListener("click",resetPassword);$("recoveryForm").addEventListener("submit",changePassword);$("cancelRecovery").addEventListener("click",cancelPasswordRecovery);$("signOutButton").addEventListener("click",signOutUser);$("deskMenuSignOutButton").addEventListener("click",signOutUser);
$("deskAccountMenuToggle").addEventListener("click",event=>{event.stopPropagation();const menu=$("deskAccountMenuPopover"),opening=menu.hidden;menu.hidden=!opening;$("deskAccountMenuToggle").setAttribute("aria-expanded",String(opening));});
$("deskMenuDraftsButton").addEventListener("click",()=>{const menu=$("deskAccountMenuPopover");if(menu)menu.hidden=true;$("deskAccountMenuToggle").setAttribute("aria-expanded","false");goView("dashboard");$("savedDraftsList").scrollIntoView({behavior:"smooth",block:"center"});});
$("resendConfirmationButton").addEventListener("click",resendSignupConfirmation);
document.addEventListener("click",event=>{if(!event.target.closest("#deskAccountMenuWrap")){$("deskAccountMenuPopover").hidden=true;$("deskAccountMenuToggle").setAttribute("aria-expanded","false");}});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){$("deskAccountMenuPopover").hidden=true;$("deskAccountMenuToggle").setAttribute("aria-expanded","false");}});$("profileForm").addEventListener("submit",saveProfile);$("cvUploadForm").addEventListener("submit",uploadCV);$("cvFileList").addEventListener("click",e=>{const d=e.target.closest("[data-cv-download]"),r=e.target.closest("[data-cv-delete]");if(d)downloadCV(d.dataset.cvDownload);if(r)deleteCV(r.dataset.cvDelete);});$("applicationsList").addEventListener("change",e=>{const el=e.target.closest("[data-app-status]");if(el)updateAppStatus(el.dataset.appStatus,el.value);});$("applicationsList").addEventListener("click",e=>{const rm=e.target.closest("[data-remove-app]"),ed=e.target.closest("[data-edit-app]");if(rm)removeApp(rm.dataset.removeApp);if(ed)editNotes(ed.dataset.editApp);});$("savedDraftsList").addEventListener("click",e=>{const open=e.target.closest("[data-open-draft]"),del=e.target.closest("[data-delete-draft]");if(open)openDraft(open.dataset.openDraft);if(del)deleteDraft(del.dataset.deleteDraft);});$("applicationSearch").addEventListener("input",renderApps);$("applicationStatusFilter").addEventListener("change",renderApps);$("addManualApplication").addEventListener("click",()=>{if(!requireUser())return;$("manualAppForm").hidden=!$("manualAppForm").hidden;});$("cancelManualApplication").addEventListener("click",()=>$("manualAppForm").hidden=true);$("manualAppForm").addEventListener("submit",async e=>{e.preventDefault();const title=trim($("manualTitle").value),institution=trim($("manualInstitution").value),record={title,institution,deadline:safeDeadline($("manualDeadline").value),official_url:trim($("manualUrl").value),opportunity_key:("manual:"+title+"|"+institution).slice(0,450),status:"interested"};const saved=await persistApplication(record);if(saved){$("manualAppForm").reset();$("manualAppForm").hidden=true;}});$("dismissSetupNotice").addEventListener("click",()=>$("setupNotice").hidden=true);}
function start(){ $("deskYear")&&($("deskYear").textContent=new Date().getFullYear());try{selected=JSON.parse(sessionStorage.getItem(SELECTED_KEY)||"null");}catch{selected=null;}if(selected&&trim(selected.title)){$("selectedOpportunityCard").hidden=false;$("selectedOppTitle").textContent=trim(selected.title);$("selectedOppMeta").textContent=[valueFrom(["hosting_institution","funding_organization","institution"]),valueFrom(["location"]),valueFrom(["closing_date","deadline","application_deadline"])?"Deadline: "+valueFrom(["closing_date","deadline","application_deadline"]):""].filter(Boolean).join(" · ");const url=safeHTTP(valueFrom(["application_url","source_url","url"]));if(url){$("selectedOppOfficial").href=url;$("selectedOppOfficial").hidden=false;}}bind();const query=new URLSearchParams(location.search),requested=query.get("tool");if(requested==="tracker"){pendingAutoTrack=true;goView("applications");}else if(tools[requested])renderTool(requested);else goView("dashboard");initAuth();}
document.addEventListener("DOMContentLoaded",start);
})();