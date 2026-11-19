import { db } from "./firebase.js?v=20261118-01";
import { collection, doc, getDoc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { isFuturePractice, formatPracticeSchedule } from "./practice-editor.js?v=20260926-02";
import { showToast } from "./ui.js?v=20260926-02";

const SECTION_DEFS = [
  { id:"objectives", title:"Practice objectives", hint:"What was the team trying to accomplish today?", required:true },
  { id:"technicalFindings", title:"Technical findings and observations", hint:"Record measurements, discoveries, design decisions, and useful observations.", required:true },
  { id:"problems", title:"Problems and solutions", hint:"Describe the issue, its likely cause, and what the team tried or changed.", required:true },
  { id:"lessons", title:"Lessons learned", hint:"Capture the technical and process lessons the team should retain.", required:true },
  { id:"testing", title:"Testing record", hint:"Include what was tested, conditions, result, and any follow-up. Use N/A when no testing occurred.", required:true },
  { id:"nextSteps", title:"Next-practice priorities", hint:"Summarize the most important priorities for the next session. Individual action items can be tracked below.", required:true },
  { id:"evidence", title:"Supporting documentation", hint:"Add links to relevant photos, CAD, code, videos, or test data. Do not add private credentials.", required:false }
];

let user=null, practice=null, attendance=null, sections={}, items=[], history=[];
let unsubs=[], saving=new Set(), editingItem=null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const displayName = () => user?.displayName || user?.email || "Team member";
const dateText = value => {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(date);
};
function addHistory(action, detail, sectionId="") {
  return addDoc(collection(db,"practices",practice.id,"documentHistory"),{
    action, detail, sectionId, userId:user.uid, memberName:displayName(), createdAt:serverTimestamp()
  });
}
function progress() {
  const filled = SECTION_DEFS.filter(s=>s.required && String(sections[s.id]?.content||"").trim().length>0).length;
  const workCount = items.filter(item=>item.type==="work").length;
  const total = SECTION_DEFS.filter(s=>s.required).length + 1;
  const score = filled + (workCount ? 1 : 0);
  return {filled,workCount,total,score,complete:score===total};
}
function renderHeader() {
  $("doc-practice-title").textContent = practice.title || "Untitled practice";
  $("doc-practice-meta").textContent = formatPracticeSchedule(practice) + (practice.location ? " · "+practice.location : "");
  const p=progress();
  $("doc-progress-label").textContent=p.complete?"Ready for review":p.score===0?"Not started":"In progress";
  $("doc-progress-count").textContent=p.score+" / "+p.total+" sections";
  $("doc-progress-bar").style.width=(p.score/p.total*100)+"%";
  $("doc-status-note").textContent=p.complete
    ? "All core sections have content. A team member can mark this document reviewed."
    : "Complete the core sections and add at least one work item. Any team member can contribute.";
  $("doc-review-status").textContent=sections._meta?.reviewed ? "Reviewed by "+(sections._meta.reviewedByName||"team member") : "Not yet reviewed";
  $("doc-review-button").textContent=sections._meta?.reviewed ? "Reopen for review" : "Mark reviewed";
  $("doc-review-button").classList.toggle("btn-primary",!sections._meta?.reviewed);
}
function renderSections() {
  $("document-sections").innerHTML=SECTION_DEFS.map(section=>{
    const data=sections[section.id]||{};
    return '<section class="card-shell shared-section" data-section="'+section.id+'">'+
      '<div class="shared-section-head"><div><h3>'+esc(section.title)+'</h3><p>'+esc(section.hint)+'</p></div><span class="chip '+(String(data.content||"").trim()?"chip-success":"chip-neutral")+'">'+(String(data.content||"").trim()?"Saved":"Needs input")+'</span></div>'+
      '<textarea class="form-textarea shared-section-input" rows="'+(section.id==="evidence"?3:4)+'" data-content="'+section.id+'" placeholder="Add to the team record…">'+esc(data.content||"")+'</textarea>'+
      '<div class="shared-section-footer"><span class="shared-updated">'+(data.updatedAt?"Last updated "+esc(dateText(data.updatedAt))+(data.updatedByName?" by "+esc(data.updatedByName):""):"Not yet documented")+'</span><button class="btn btn-outline btn-sm" type="button" data-save-section="'+section.id+'">Save section</button></div>'+
    '</section>';
  }).join("");
  $("document-sections").querySelectorAll("[data-save-section]").forEach(button=>button.addEventListener("click",()=>saveSection(button.dataset.saveSection,button)));
}
async function saveSection(id,button) {
  if(!canEdit()) return;
  const input=document.querySelector('[data-content="'+id+'"]');
  const content=input.value.trim();
  button.disabled=true; button.textContent="Saving…";
  try {
    await setDoc(doc(db,"practices",practice.id,"documentSections",id),{
      content, updatedAt:serverTimestamp(), updatedBy:user.uid, updatedByName:displayName()
    },{merge:true});
    await addHistory("Updated section",SECTION_DEFS.find(s=>s.id===id)?.title||id,id);
    showToast("Section saved.","success");
  } catch(error) {
    console.error("Section save failed:",error);
    showToast("Could not save section: "+error.message,"error",7000);
  } finally {button.disabled=false;button.textContent="Save section";}
}
function canEdit() {
  if(!practice) return false;
  if(isFuturePractice(practice)) {showToast("This practice has not started. The document is read-only until it begins.","warning");return false;}
  return true;
}
function renderItems() {
  const work=items.filter(item=>item.type==="work");
  const next=items.filter(item=>item.type==="next");
  $("work-items").innerHTML=work.length?work.map(item=>renderItem(item,"work")).join(""):'<div class="empty-state compact-empty"><p>No work items documented yet. Add the work completed by the team.</p></div>';
  $("next-items").innerHTML=next.length?next.map(item=>renderItem(item,"next")).join(""):'<div class="empty-state compact-empty"><p>No next-practice action items yet.</p></div>';
  document.querySelectorAll("[data-item-edit]").forEach(button=>button.addEventListener("click",()=>editItem(button.dataset.itemEdit)));
  document.querySelectorAll("[data-item-delete]").forEach(button=>button.addEventListener("click",()=>removeItem(button.dataset.itemDelete)));
  document.querySelectorAll("[data-item-toggle]").forEach(button=>button.addEventListener("click",()=>toggleItem(button.dataset.itemToggle)));
}
function renderItem(item,type) {
  const done=item.status==="complete";
  return '<article class="shared-item '+(done?"is-complete":"")+'"><div class="shared-item-main"><div class="shared-item-title">'+esc(item.text)+'</div><div class="shared-item-meta">'+esc(item.category||"General")+' · Added by '+esc(item.createdByName||"Team member")+(item.updatedByName&&item.updatedByName!==item.createdByName?" · Updated by "+esc(item.updatedByName):"")+'</div></div><div class="shared-item-actions">'+(type==="next"?'<button class="btn btn-outline btn-xs" type="button" data-item-toggle="'+item.id+'">'+(done?"Reopen":"Complete")+'</button>':"")+'<button class="btn btn-outline btn-xs" type="button" data-item-edit="'+item.id+'">Edit</button><button class="btn btn-ghost btn-xs" type="button" data-item-delete="'+item.id+'" aria-label="Delete item">×</button></div></article>';
}
async function addItem(type) {
  if(!canEdit()) return;
  const textInput=$(type==="work"?"work-text":"next-text");
  const categoryInput=$(type==="work"?"work-category":"next-category");
  const text=textInput.value.trim();
  if(!text){showToast("Enter a description before adding this item.","warning");textInput.focus();return;}
  try {
    const ref=await addDoc(collection(db,"practices",practice.id,"documentItems"),{
      type,text,category:categoryInput.value||"General",status:"open",
      createdBy:user.uid,createdByName:displayName(),updatedBy:user.uid,updatedByName:displayName(),
      createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    await addHistory(type==="work"?"Added work item":"Added next step",text);
    textInput.value="";
    showToast("Added to the shared document.","success");
  } catch(error){console.error("Item add failed:",error);showToast("Could not add item: "+error.message,"error",7000);}
}
async function editItem(id) {
  const item=items.find(entry=>entry.id===id);
  if(!item||!canEdit())return;
  const next=window.prompt("Edit this shared item:",item.text);
  if(next===null)return;
  const text=next.trim();
  if(!text){showToast("An item cannot be empty. Delete it if it is no longer needed.","warning");return;}
  try {
    await updateDoc(doc(db,"practices",practice.id,"documentItems",id),{text,updatedAt:serverTimestamp(),updatedBy:user.uid,updatedByName:displayName()});
    await addHistory("Edited item",text);
  } catch(error){showToast("Could not update item: "+error.message,"error",7000);}
}
async function removeItem(id) {
  const item=items.find(entry=>entry.id===id);
  if(!item||!canEdit()||!window.confirm("Remove this item from the shared document?"))return;
  try {
    await deleteDoc(doc(db,"practices",practice.id,"documentItems",id));
    await addHistory("Removed item",item.text);
  } catch(error){showToast("Could not remove item: "+error.message,"error",7000);}
}
async function toggleItem(id) {
  const item=items.find(entry=>entry.id===id);
  if(!item||!canEdit())return;
  const status=item.status==="complete"?"open":"complete";
  try {
    await updateDoc(doc(db,"practices",practice.id,"documentItems",id),{status,updatedAt:serverTimestamp(),updatedBy:user.uid,updatedByName:displayName()});
    await addHistory(status==="complete"?"Completed next step":"Reopened next step",item.text);
  } catch(error){showToast("Could not update next step: "+error.message,"error",7000);}
}
async function toggleReview() {
  if(!canEdit())return;
  const reviewed=!sections._meta?.reviewed;
  try {
    await setDoc(doc(db,"practices",practice.id,"documentMeta","main"),{
      reviewed,reviewedAt:reviewed?serverTimestamp():null,reviewedBy:reviewed?user.uid:null,
      reviewedByName:reviewed?displayName():null,updatedAt:serverTimestamp()
    },{merge:true});
    await addHistory(reviewed?"Marked document reviewed":"Reopened document for review",reviewed?"Reviewed":"Reopened");
  } catch(error){showToast("Review status could not be updated: "+error.message,"error",7000);}
}
function renderHistory() {
  const recent=history.slice(0,12);
  $("document-history").innerHTML=recent.length?recent.map(entry=>'<div class="history-row"><div><strong>'+esc(entry.action||"Updated document")+'</strong><span>'+esc(entry.detail||"")+'</span></div><div class="history-meta">'+esc(entry.memberName||"Team member")+'<br>'+esc(dateText(entry.createdAt))+'</div></div>').join(""):'<div class="empty-state compact-empty"><p>Changes will appear here as team members contribute.</p></div>';
}
function updateReadOnly() {
  const locked=isFuturePractice(practice);
  $("future-document-banner").hidden=!locked;
  document.querySelectorAll("#document-sections textarea,#document-sections button,#work-form input,#work-form select,#work-form button,#next-form input,#next-form select,#next-form button,#doc-review-button").forEach(el=>el.disabled=locked);
  if(locked)$("future-document-banner").textContent="This practice has not started. The shared document is available to view, but editing opens at the scheduled start time.";
}
function subscribe() {
  const base=["practices",practice.id];
  unsubs.push(onSnapshot(collection(db,...base,"documentSections"),snap=>{
    sections={...sections};
    snap.docs.forEach(d=>sections[d.id]=d.data());
    renderSections();renderHeader();
  },error=>showToast("Document sections could not load: "+error.message,"error",7000)));
  unsubs.push(onSnapshot(collection(db,...base,"documentItems"),snap=>{
    items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.createdAt?.toMillis?.()||0)-(b.createdAt?.toMillis?.()||0));
    renderItems();renderHeader();
  },error=>showToast("Document items could not load: "+error.message,"error",7000)));
  unsubs.push(onSnapshot(query(collection(db,...base,"documentHistory"),orderBy("createdAt","desc")),snap=>{
    history=snap.docs.map(d=>({id:d.id,...d.data()}));renderHistory();
  },error=>{console.error("History unavailable:",error);$("document-history").innerHTML='<p class="muted">Revision history is temporarily unavailable.</p>';}));
  unsubs.push(onSnapshot(doc(db,...base,"documentMeta","main"),snap=>{
    sections._meta=snap.exists()?snap.data():{};renderHeader();
  },error=>console.error("Document metadata failed:",error)));
  unsubs.push(onSnapshot(doc(db,...base,"attendance",user.uid),snap=>{
    attendance=snap.exists()?snap.data():null;
    $("attendance-status").textContent=attendance?.status==="not_present"?"You are marked not present":"Attendance: present / not marked absent";
  }));
}
export async function initializeSharedDocument(authUser) {
  user=authUser;
  const practiceId=new URLSearchParams(location.search).get("id")||new URLSearchParams(location.search).get("practiceId");
  if(!practiceId){$("document-root").innerHTML='<div class="notice notice-danger">A practice ID is required. Return to Practices and open a practice.</div>';return;}
  try {
    const snap=await getDoc(doc(db,"practices",practiceId));
    if(!snap.exists()||snap.data().deleting){$("document-root").innerHTML='<div class="notice notice-danger">This practice could not be found.</div>';return;}
    practice={id:snap.id,...snap.data()};
    $("doc-practice-title").textContent=practice.title||"Untitled practice";
    $("doc-practice-meta").textContent=formatPracticeSchedule(practice);
    $("attendance-status").textContent="Loading attendance…";
    $("work-add").addEventListener("click",()=>addItem("work"));
    $("next-add").addEventListener("click",()=>addItem("next"));
    $("doc-review-button").addEventListener("click",toggleReview);
    $("work-text").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addItem("work");}});
    $("next-text").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addItem("next");}});
    subscribe();
    updateReadOnly();
    $("document-root").hidden=false;
  } catch(error) {
    console.error("Shared document initialization failed:",error);
    $("document-root").innerHTML='<div class="notice notice-danger">The shared practice document could not be opened: '+esc(error.message)+'</div>';
  }
}
