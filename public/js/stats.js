import {db} from "./firebase.js?v=20261119-01";
import {collection,doc,onSnapshot,query,orderBy} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {formatPracticeSchedule} from "./practice-editor.js?v=20260926-02";
let practices=[],records=new Map(),unsubs=new Map();
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const dateValue=v=>v?.toDate?v.toDate():v?new Date(v):null;
const time=v=>{const d=dateValue(v);return d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d):"—";};
const duration=ms=>{const m=Math.max(0,Math.round((Number(ms)||0)/60000));return m<1?"<1 min":m<60?m+" min":Math.floor(m/60)+"h "+(m%60)+"m";};
function emptyRecord(){return{meta:{},contributors:[],history:[],sessions:[]};}
function total(field){let n=0;records.forEach(r=>r.contributors.forEach(c=>n+=Number(c[field]||0)));return n;}
function globalPeople(){
 const map=new Map();
 records.forEach(r=>r.contributors.forEach(c=>{const id=c.userId||c.id;if(!id)return;const old=map.get(id)||{userId:id,memberName:c.memberName||"Team member",contributions:0,words:0,time:0};old.contributions+=Number(c.contributionCount||0);old.words+=Number(c.wordsAdded||0);old.time+=Number(c.activeEditingMs||0);old.memberName=c.memberName||old.memberName;map.set(id,old);}));
 return [...map.values()];
}
function render(){
 const people=globalPeople(),mostActions=people.slice().sort((a,b)=>b.contributions-a.contributions)[0],mostWords=people.slice().sort((a,b)=>b.words-a.words)[0],mostTime=people.slice().sort((a,b)=>b.time-a.time)[0];
 $("stats-documents").textContent=practices.length;
 $("stats-contributions").textContent=total("contributionCount").toLocaleString();
 $("stats-words").textContent=total("wordsAdded").toLocaleString();
 $("stats-time").textContent=duration(total("activeEditingMs"));
 $("stats-top-action").textContent=mostActions?mostActions.memberName:"—";
 $("stats-top-words").textContent=mostWords?mostWords.memberName:"—";
 $("stats-top-time").textContent=mostTime?mostTime.memberName:"—";
 $("stats-leaderboard").innerHTML=people.length?people.sort((a,b)=>b.contributions-a.contributions).map((p,i)=>'<tr><td><span class="stats-rank">'+(i+1)+'</span>'+esc(p.memberName)+'</td><td>'+p.contributions.toLocaleString()+'</td><td>'+p.words.toLocaleString()+'</td><td>'+duration(p.time)+'</td></tr>').join(""):'<tr><td colspan="4" class="stats-empty-cell">No contributions recorded yet.</td></tr>';
 const sorted=practices.slice().sort((a,b)=>String(b.dateKey||b.id).localeCompare(String(a.dateKey||a.id)));
 $("document-analytics").innerHTML=sorted.length?sorted.map(p=>{
  const r=records.get(p.id)||emptyRecord(),members=r.contributors.slice().sort((a,b)=>(b.contributionCount||0)-(a.contributionCount||0)),events=r.history.slice().sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  const actions=members.reduce((n,x)=>n+Number(x.contributionCount||0),0),words=members.reduce((n,x)=>n+Number(x.wordsAdded||0),0),active=members.reduce((n,x)=>n+Number(x.activeEditingMs||0),0);
  const top=members[0];
  return '<article class="card-shell stats-document"><div class="stats-document-head"><div><div class="eyebrow">Practice document</div><h3>'+esc(p.title||"Untitled practice")+'</h3><p>'+esc(formatPracticeSchedule(p))+(p.location?" · "+esc(p.location):"")+'</p><span class="stats-last-edited">'+(r.meta.lastEditedAt?"Last edited "+esc(time(r.meta.lastEditedAt))+" by "+esc(r.meta.lastEditedByName||"Team member"):"No edits recorded yet")+'</span></div><span class="chip '+(r.meta.complete?"chip-success":"chip-neutral")+'">'+(r.meta.complete?"Complete":"In progress")+'</span></div>'+
  '<div class="stats-document-kpis"><div><span>Contributions</span><strong>'+actions+'</strong></div><div><span>Words added</span><strong>'+words.toLocaleString()+'</strong></div><div><span>Active editor time</span><strong>'+duration(active)+'</strong></div><div><span>Editing sessions</span><strong>'+r.sessions.length+'</strong></div></div>'+
  '<div class="stats-subsection"><h4>Contributor breakdown</h4>'+(members.length?'<div class="table-wrap"><table class="stats-table"><thead><tr><th>Contributor</th><th>Edits / actions</th><th>Words added</th><th>Active time</th></tr></thead><tbody>'+members.map((m,i)=>'<tr><td><span class="stats-rank">'+(i+1)+'</span>'+esc(m.memberName||"Team member")+(i===0?'<span class="chip chip-primary stats-top-chip">Most contributions</span>':"")+'</td><td>'+Number(m.contributionCount||0)+'</td><td>'+Number(m.wordsAdded||0).toLocaleString()+'</td><td>'+duration(m.activeEditingMs)+'</td></tr>').join("")+'</tbody></table></div>':'<p class="stats-muted">No one has contributed yet.</p>')+'</div>'+
  '<details class="stats-subsection stats-history"><summary>Revision and activity history ('+events.length+')</summary>'+(events.length?'<div class="stats-event-list">'+events.map(e=>'<article class="stats-event"><div class="stats-event-head"><strong>'+esc(e.action||"Updated document")+'</strong><span>'+esc(e.memberName||"Team member")+' · '+esc(time(e.createdAt))+'</span></div><p>'+esc(e.detail||"")+'</p><div class="stats-event-metrics">'+Number(e.wordsAdded||0)+' words added · '+Number(e.wordsRemoved||0)+' removed</div>'+(e.before!==undefined||e.after!==undefined?'<details class="stats-diff"><summary>Compare saved versions</summary><div class="stats-diff-grid"><div><strong>Previous version</strong><pre>'+esc(e.before||"No previous content")+'</pre></div><div><strong>Saved version</strong><pre>'+esc(e.after||"")+'</pre></div></div></details>':"")+'</article>').join("")+'</div>':'<p class="stats-muted">No revision events recorded yet.</p>')+'</details></article>';
 }).join(""):'<div class="card-shell"><div class="empty-state"><h3>No practice documents</h3><p>Contribution analytics will appear here after practices are created.</p></div></div>';
}
function sync(){
 const active=new Set(practices.map(p=>p.id));
 for(const [id,off] of unsubs)if(!active.has(id)){off.forEach(fn=>fn());unsubs.delete(id);records.delete(id);}
 practices.forEach(p=>{
  if(unsubs.has(p.id))return;
  const record=emptyRecord(),offs=[];
  offs.push(onSnapshot(doc(db,"practices",p.id,"documentMeta","main"),s=>{record.meta=s.exists()?s.data():{};records.set(p.id,record);render();},e=>console.warn("Metadata load failed",e)));
  offs.push(onSnapshot(collection(db,"practices",p.id,"documentContributors"),s=>{record.contributors=s.docs.map(d=>({id:d.id,...d.data()}));records.set(p.id,record);render();},e=>console.warn("Contributor load failed",e)));
  offs.push(onSnapshot(query(collection(db,"practices",p.id,"documentHistory"),orderBy("createdAt","desc")),s=>{record.history=s.docs.map(d=>({id:d.id,...d.data()}));records.set(p.id,record);render();},e=>console.warn("History load failed",e)));
  offs.push(onSnapshot(collection(db,"practices",p.id,"documentSessions"),s=>{record.sessions=s.docs.map(d=>d.data());records.set(p.id,record);render();},e=>console.warn("Session load failed",e)));
  unsubs.set(p.id,offs);records.set(p.id,record);
 });
}
export function initializeStats(){
 $("stats-content").innerHTML='<section class="page-header"><div class="page-header-copy"><h2 class="page-title">Contribution analytics</h2><p class="page-subtitle">Detailed collaboration and editing activity across practice documents.</p></div></section>'+
 '<section class="stats-grid stats-overview"><article class="stat-card"><div class="stat-label">Practice documents</div><div id="stats-documents" class="stat-value">—</div></article><article class="stat-card"><div class="stat-label">Contributions</div><div id="stats-contributions" class="stat-value">—</div></article><article class="stat-card"><div class="stat-label">Words added</div><div id="stats-words" class="stat-value">—</div></article><article class="stat-card"><div class="stat-label">Active editor time</div><div id="stats-time" class="stat-value">—</div></article></section>'+
 '<section class="stats-highlights"><article class="card-shell"><span>Most contributions</span><strong id="stats-top-action">—</strong></article><article class="card-shell"><span>Most words added</span><strong id="stats-top-words">—</strong></article><article class="card-shell"><span>Most active editing time</span><strong id="stats-top-time">—</strong></article></section>'+
 '<section class="stats-panel card-shell"><div class="section-head"><div><h2>Overall contributor totals</h2><p>Totals combine contribution events across all practice documents.</p></div></div><div class="table-wrap"><table class="stats-table"><thead><tr><th>Member</th><th>Contributions</th><th>Words added</th><th>Active editor time</th></tr></thead><tbody id="stats-leaderboard"></tbody></table></div></section>'+
 '<section class="section-head stats-documents-heading"><div><h2>Document-by-document analytics</h2><p>Contribution breakdowns and detailed revision history for each practice.</p></div></section><div id="document-analytics" class="stats-document-list"></div>';
 onSnapshot(collection(db,"practices"),snap=>{practices=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>!p.deleting);sync();render();},error=>{$("document-analytics").innerHTML='<div class="notice notice-danger">Analytics could not be loaded: '+esc(error.message)+'</div>';});
}