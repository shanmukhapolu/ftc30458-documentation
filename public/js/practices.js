import {db} from "./firebase.js?v=20261119-01";
import {collection,doc,onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {showToast} from "./ui.js?v=20260926-02";
import {deletePracticeCompletely} from "./practice-delete.js?v=20260926-02";
import {initializePracticeEditor,openPracticeEditor,isFuturePractice,formatPracticeSchedule,formatPracticeDateOnly} from "./practice-editor.js?v=20261119-03";
let user=null,practices=[],metadata=new Map(),metaOff=new Map();
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const start=p=>Number.isFinite(Number(p.startAtMs))?Number(p.startAtMs):new Date((p.dateKey||"1970-01-01")+"T00:00:00").getTime();
function timing(p){return [formatPracticeSchedule(p).split(" · ").slice(1).join(" · "),p.location].filter(Boolean).join(" · ");}
function dateStamp(p){const [y,m,d]=String(p.dateKey||"").split("-").map(Number);if(!y||!m||!d)return '<div class="practice-date-stamp"><strong>—</strong><span>Practice</span></div>';const dt=new Date(y,m-1,d);return '<div class="practice-date-stamp"><strong>'+String(d).padStart(2,"0")+'</strong><span>'+new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric"}).format(dt)+'</span></div>';}
function lastEdited(m){if(!m?.lastEditedAt)return "No contributions yet";const d=m.lastEditedAt?.toDate?m.lastEditedAt.toDate():new Date(m.lastEditedAt);return "Last edited "+new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d)+(m.lastEditedByName?" by "+m.lastEditedByName:"");}
function render(){
 const list=document.getElementById("practice-list"),search=document.getElementById("practice-search");if(!list||!search)return;
 const term=search.value.trim().toLowerCase(),rows=practices.filter(p=>[p.title,p.dateKey,p.location,p.description,formatPracticeSchedule(p)].join(" ").toLowerCase().includes(term));
 if(!rows.length){list.innerHTML='<div class="card-shell"><div class="empty-state"><h3>No practices found</h3><p>Create a practice or change your search.</p></div></div>';return;}
 list.innerHTML=rows.map(p=>{const m=metadata.get(p.id)||{},future=isFuturePractice(p),label=future?"Upcoming":m.complete?"Complete":"In progress",chip=future?"chip-primary":m.complete?"chip-success":"chip-warning";return '<article class="practice-row" tabindex="0" data-id="'+esc(p.id)+'">'+dateStamp(p)+'<div class="practice-main"><div class="practice-title-line"><h3 class="practice-title">'+esc(formatPracticeDateOnly(p))+'</h3><span class="chip '+chip+'">'+label+'</span></div><p class="practice-description">'+esc(timing(p))+'</p><div class="practice-meta"><span>'+lastEdited(m)+'</span>'+(m.completionScore!==undefined?'<span>•</span><span>'+Number(m.completionScore)+' / '+Number(m.totalSections||7)+' sections</span>':"")+'</div></div><div class="practice-side"><div class="practice-row-actions"><button class="btn btn-outline btn-sm" type="button" data-edit="'+esc(p.id)+'">Edit details</button><button class="btn btn-danger btn-sm" type="button" data-delete="'+esc(p.id)+'">Delete</button></div></div></article>';}).join("");
 list.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();const p=practices.find(x=>x.id===b.dataset.edit);if(p)openPracticeEditor(p);}));
 list.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",async e=>{e.stopPropagation();const p=practices.find(x=>x.id===b.dataset.delete);if(!p||!confirm('Delete "'+(formatPracticeDateOnly(p))+'" and its complete document? This cannot be undone.'))return;b.disabled=true;b.textContent="Deleting…";try{const result=await deletePracticeCompletely(p.id);showToast("Practice and "+(result.deletedDocumentRecordCount||0)+" document records deleted.","success",6000);}catch(error){b.disabled=false;b.textContent="Delete";showToast("Delete failed: "+error.message,"error",8000);}}));
 list.querySelectorAll("[data-id]").forEach(row=>{row.addEventListener("click",e=>{if(!e.target.closest("button"))location.href="./practice.html?id="+encodeURIComponent(row.dataset.id);});row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();location.href="./practice.html?id="+encodeURIComponent(row.dataset.id);}});});
}
function syncMeta(){
 const active=new Set(practices.map(p=>p.id));
 for(const [id,off] of metaOff)if(!active.has(id)){off();metaOff.delete(id);metadata.delete(id);}
 practices.forEach(p=>{if(!metaOff.has(p.id))metaOff.set(p.id,onSnapshot(doc(db,"practices",p.id,"documentMeta","main"),s=>{metadata.set(p.id,s.exists()?s.data():{});render();},e=>{console.warn("Document status unavailable",e);metadata.set(p.id,{});render();}));});
}
export function initializePractices(authUser){
 user=authUser;const create=document.getElementById("create-practice"),search=document.getElementById("practice-search"),list=document.getElementById("practice-list");if(!create||!search||!list)return;
 initializePracticeEditor(user,id=>{if(id)location.href="./practice.html?id="+encodeURIComponent(id);});
 create.addEventListener("click",()=>openPracticeEditor());search.addEventListener("input",render);
 onSnapshot(collection(db,"practices"),s=>{practices=s.docs.map(d=>({id:d.id,...d.data()})).filter(p=>!p.deleting).sort((a,b)=>start(b)-start(a));syncMeta();render();},e=>{console.error(e);list.innerHTML='<div class="notice notice-danger">Practices could not load: '+esc(e.message)+'</div>';showToast("Practices could not load: "+e.message,"error",7000);});
}