import {db} from "./firebase.js?v=20261119-01";
import {collection,doc,onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {formatPracticeSchedule,isFuturePractice} from "./practice-editor.js?v=20260926-02";
import {showToast} from "./ui.js?v=20260926-02";
let user=null,practices=[],metadata=new Map(),unsubs=new Map();
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const start=p=>Number.isFinite(Number(p.startAtMs))?Number(p.startAtMs):new Date((p.dateKey||"1970-01-01")+"T00:00:00").getTime();
function formatLast(meta){if(!meta?.lastEditedAt)return "No contributions yet";const t=meta.lastEditedAt?.toDate?meta.lastEditedAt.toDate():new Date(meta.lastEditedAt);return "Last edited "+new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(t)+(meta.lastEditedByName?" by "+meta.lastEditedByName:"");}
function render(){
 const completed=practices.filter(p=>metadata.get(p.id)?.complete).length;const inProgress=practices.filter(p=>!isFuturePractice(p)&&!metadata.get(p.id)?.complete).length;
 $("stat-practices").textContent=practices.length;$("stat-in-progress").textContent=inProgress;$("stat-complete").textContent=completed;
 $("recent-practices").innerHTML=practices.length?practices.slice(0,6).map(p=>{const m=metadata.get(p.id)||{},future=isFuturePractice(p),complete=Boolean(m.complete),label=future?"Upcoming":complete?"Complete":"In progress",chip=future?"chip-primary":complete?"chip-success":"chip-warning";return '<article class="practice-row dashboard-practice-row" tabindex="0" data-id="'+esc(p.id)+'"><div class="practice-number">LOG<div class="practice-date">'+(future?"Upcoming":"Practice")+'</div></div><div class="practice-main"><div class="practice-title-line"><h3 class="practice-title">'+esc(p.title||"Untitled practice")+'</h3><span class="chip '+chip+'">'+label+'</span></div><p class="practice-description">'+esc(formatPracticeSchedule(p))+(p.location?" · "+esc(p.location):"")+'</p><div class="practice-meta"><span>'+formatLast(m)+'</span></div></div></article>';}).join(""):'<div class="card-shell"><div class="empty-state"><h3>No practices yet</h3><p>Create a practice to start the team’s engineering record.</p><a class="btn btn-primary btn-sm" href="./practices.html">Go to practices</a></div></div>';
 $("recent-practices").querySelectorAll("[data-id]").forEach(row=>{row.addEventListener("click",()=>location.href="./practice.html?id="+encodeURIComponent(row.dataset.id));row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();location.href="./practice.html?id="+encodeURIComponent(row.dataset.id);}});});
}
function syncMetadata(){
 const active=new Set(practices.map(p=>p.id));
 for(const [id,off] of unsubs)if(!active.has(id)){off();unsubs.delete(id);metadata.delete(id);}
 practices.forEach(p=>{if(!unsubs.has(p.id))unsubs.set(p.id,onSnapshot(doc(db,"practices",p.id,"documentMeta","main"),snap=>{metadata.set(p.id,snap.exists()?snap.data():{});render();},error=>{console.warn("Document metadata unavailable",error);metadata.set(p.id,{});render();}));});
}
export function initializeDashboard(authUser){
 user=authUser;$("welcome").textContent="Welcome back, "+((user.displayName||user.email||"team member").split(" ")[0])+".";
 onSnapshot(collection(db,"practices"),snap=>{practices=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>!p.deleting).sort((a,b)=>start(b)-start(a));syncMetadata();render();},error=>{console.error(error);$("recent-practices").innerHTML='<div class="notice notice-danger">Practices could not load: '+esc(error.message)+'</div>';showToast("Practices could not load: "+error.message,"error",7000);});
}