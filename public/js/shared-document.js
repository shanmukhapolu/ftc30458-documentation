import { db } from "./firebase.js?v=20261119-01";
import {
  collection, doc, getDoc, getDocs, onSnapshot, setDoc, addDoc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy, increment, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { isFuturePractice, formatPracticeSchedule, initializePracticeEditor, openPracticeEditor } from "./practice-editor.js?v=20260926-02";
import { deletePracticeCompletely } from "./practice-delete.js?v=20260926-02";
import { showToast } from "./ui.js?v=20260926-02";

const SECTION_DEFS = [
  {id:"objectives",title:"Practice objectives",hint:"The goals and priorities for this session."},
  {id:"technicalFindings",title:"Technical findings and observations",hint:"Measurements, discoveries, design decisions, and useful observations."},
  {id:"problems",title:"Problems and solutions",hint:"Issues encountered, likely causes, attempted fixes, and final outcomes."},
  {id:"lessons",title:"Lessons learned",hint:"Technical and process lessons the team should carry forward."},
  {id:"testing",title:"Testing record",hint:"What was tested, under what conditions, the result, and any follow-up."},
  {id:"nextSteps",title:"Next-practice priorities",hint:"The most important priorities for the next session."},
  {id:"evidence",title:"Supporting documentation",hint:"Links to relevant photos, CAD, code, videos, and test data.",optional:true}
];
const CATEGORIES=["General","Mechanical","Programming","Electrical","CAD / Design","Outreach","Strategy","Business"];
let user=null,practice=null,sections={},items=[],contributors=[],meta={},attendance=null;
let unsubs=[],editingSection=null,editingItem=null,editingList=null,activeSession=null,sessionTimer=null,sessionBusy=false;
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const name=()=>user?.displayName||user?.email||"Team member";
const wordTokens=value=>(String(value||"").toLowerCase().match(/[a-z0-9']+/g)||[]);
function wordDelta(before,after){
  const counts=new Map();
  wordTokens(before).forEach(w=>counts.set(w,(counts.get(w)||0)-1));
  wordTokens(after).forEach(w=>counts.set(w,(counts.get(w)||0)+1));
  let added=0,removed=0;
  counts.forEach(value=>{if(value>0)added+=value;else removed+=Math.abs(value);});
  return {wordsAdded:added,wordsRemoved:removed};
}
function formatDate(value){
  if(!value)return "Not yet edited";
  const d=value?.toDate?value.toDate():new Date(value);
  if(Number.isNaN(d.getTime()))return "Not yet edited";
  return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d);
}
function formatDuration(ms){
  const mins=Math.max(0,Math.round((Number(ms)||0)/60000));
  if(mins<1)return "<1 min";
  if(mins<60)return mins+" min";
  const hours=Math.floor(mins/60),rest=mins%60;
  return hours+"h "+rest+"m";
}
function inlineMarkdown(line){
  let value=esc(line);
  value=value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  value=value.replace(/`([^`]+)`/g,"<code>$1</code>");
  value=value.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
  value=value.replace(/\*([^*]+)\*/g,"<em>$1</em>");
  return value;
}
function markdownToHtml(markdown){
  const lines=String(markdown||"").replace(/\r\n?/g,"\n").split("\n");
  const out=[];let paragraph=[],listType=null,listItems=[],quote=[],code=[],inCode=false;
  const flushParagraph=()=>{if(paragraph.length){out.push("<p>"+paragraph.map(inlineMarkdown).join("<br>")+"</p>");paragraph=[];}};
  const flushList=()=>{if(listItems.length){out.push("<"+listType+">"+listItems.map(x=>"<li>"+inlineMarkdown(x)+"</li>").join("")+"</"+listType+">");listItems=[];listType=null;}};
  const flushQuote=()=>{if(quote.length){out.push("<blockquote>"+quote.map(x=>"<p>"+inlineMarkdown(x)+"</p>").join("")+"</blockquote>");quote=[];}};
  const flushCode=()=>{if(code.length){out.push("<pre><code>"+esc(code.join("\n"))+"</code></pre>");code=[];}};
  for(const line of lines){
    if(line.trim().startsWith("```")){flushParagraph();flushList();flushQuote();if(inCode){flushCode();inCode=false;}else inCode=true;continue;}
    if(inCode){code.push(line);continue;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    const bullet=line.match(/^\s*[-*]\s+(.+)$/);
    const numbered=line.match(/^\s*\d+\.\s+(.+)$/);
    const quoteLine=line.match(/^>\s?(.*)$/);
    if(!line.trim()){flushParagraph();flushList();flushQuote();continue;}
    if(heading){flushParagraph();flushList();flushQuote();const level=heading[1].length;out.push("<h"+level+">"+inlineMarkdown(heading[2])+"</h"+level+">");continue;}
    if(/^\s*(---|\*\*\*|___)\s*$/.test(line)){flushParagraph();flushList();flushQuote();out.push("<hr>");continue;}
    if(bullet||numbered){flushParagraph();flushQuote();const type=bullet?"ul":"ol";if(listType&&listType!==type)flushList();listType=type;listItems.push((bullet||numbered)[1]);continue;}
    if(quoteLine){flushParagraph();flushList();quote.push(quoteLine[1]);continue;}
    flushList();flushQuote();paragraph.push(line);
  }
  flushParagraph();flushList();flushQuote();if(inCode)flushCode();
  return out.join("")||'<p class="document-empty">Nothing documented yet.</p>';
}
function sectionDef(id){return SECTION_DEFS.find(s=>s.id===id);}
function recordRefs(){
  const root=["practices",practice.id];
  return {
    history:collection(db,...root,"documentHistory"),
    contributors:doc(db,...root,"documentContributors",user.uid),
    meta:doc(db,...root,"documentMeta","main"),
    sessions:collection(db,...root,"documentSessions")
  };
}
async function recordContribution(action,detail,sectionId="",before="",after="",extra={}){
  const refs=recordRefs(),delta=wordDelta(before,after);
  const event={
    action,detail,sectionId,before:String(before||""),after:String(after||""),
    wordsAdded:delta.wordsAdded,wordsRemoved:delta.wordsRemoved,
    userId:user.uid,memberName:name(),createdAt:serverTimestamp(),...extra
  };
  const batch=writeBatch(db),eventRef=doc(refs.history);
  batch.set(eventRef,event);
  batch.set(refs.contributors,{
    userId:user.uid,memberName:name(),contributionCount:increment(1),
    wordsAdded:increment(delta.wordsAdded),wordsRemoved:increment(delta.wordsRemoved),
    lastAction:action,lastActionDetail:detail,lastActionAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  },{merge:true});
  batch.set(refs.meta,{
    lastEditedAt:serverTimestamp(),lastEditedBy:user.uid,lastEditedByName:name(),
    lastEditedAction:action,lastContributionAt:serverTimestamp()
  },{merge:true});
  await batch.commit();
  meta={...meta,lastEditedByName:name(),lastEditedAt:new Date(),lastEditedAction:action};
  renderLastEdited();
}
async function syncCompleteness(){
  const [sectionSnap,itemSnap]=await Promise.all([
    getDocs(collection(db,"practices",practice.id,"documentSections")),
    getDocs(collection(db,"practices",practice.id,"documentItems"))
  ]);
  const fresh={};sectionSnap.docs.forEach(d=>fresh[d.id]=d.data());
  const requiredSections=SECTION_DEFS.filter(s=>!s.optional);
  const filled=requiredSections.filter(s=>String(fresh[s.id]?.content||"").trim()).length;
  const workCount=itemSnap.docs.filter(d=>d.data().type==="work").length;
  const total=requiredSections.length+1,score=filled+(workCount?1:0);
  await setDoc(doc(db,"practices",practice.id,"documentMeta","main"),{
    complete:score===total,completionScore:score,totalSections:total,updatedAt:serverTimestamp()
  },{merge:true});
}
function renderLastEdited(){
  const who=meta.lastEditedByName||"No contributions yet";
  const when=formatDate(meta.lastEditedAt||practice.updatedAt||practice.createdAt);
  $("doc-last-edited").textContent=meta.lastEditedAt||meta.lastEditedByName?"Last edited "+when+" by "+who:"No contributions yet";
}
function renderSections(){
  $("document-sections").innerHTML=SECTION_DEFS.map(section=>{
    const data=sections[section.id]||{},content=String(data.content||"").trim();
    return '<article class="document-section"><div class="document-section-head"><div><h3>'+esc(section.title)+'</h3><p>'+esc(section.hint)+'</p></div><button class="btn btn-outline btn-sm" type="button" data-edit-section="'+section.id+'"'+(isFuturePractice(practice)?" disabled":"")+'>Edit</button></div><div class="markdown-content">'+(content?markdownToHtml(content):'<p class="document-empty">No content has been added to this section.</p>')+'</div><div class="document-section-meta">'+(data.updatedByName?"Last updated by "+esc(data.updatedByName)+" · "+esc(formatDate(data.updatedAt)):"Not yet documented")+'</div></article>';
  }).join("");
  $("document-sections").querySelectorAll("[data-edit-section]").forEach(button=>button.addEventListener("click",()=>openSectionEditor(button.dataset.editSection)));
}
async function startEditSession(sectionId){
  await endEditSession();
  const ref=doc(collection(db,"practices",practice.id,"documentSessions"));
  await setDoc(ref,{userId:user.uid,memberName:name(),sectionId,startedAt:serverTimestamp(),activeMs:0,status:"active",lastActivityAt:serverTimestamp()});
  activeSession={ref,lastTick:Date.now()};
  sessionTimer=setInterval(()=>flushEditSession(false),10000);
}
async function flushEditSession(force){
  if(!activeSession||sessionBusy)return;
  if(!force&&document.visibilityState!=="visible")return;
  const now=Date.now(),delta=Math.max(0,now-activeSession.lastTick);
  activeSession.lastTick=now;
  if(delta<500)return;
  sessionBusy=true;
  try{
    const batch=writeBatch(db),contributor=doc(db,"practices",practice.id,"documentContributors",user.uid);
    batch.update(activeSession.ref,{activeMs:increment(delta),lastActivityAt:serverTimestamp()});
    batch.set(contributor,{userId:user.uid,memberName:name(),activeEditingMs:increment(delta),updatedAt:serverTimestamp()},{merge:true});
    await batch.commit();
  }catch(error){console.warn("Editing-time update failed:",error);}
  finally{sessionBusy=false;}
}
async function endEditSession(){
  if(sessionTimer){clearInterval(sessionTimer);sessionTimer=null;}
  if(!activeSession)return;
  await flushEditSession(true);
  try{await updateDoc(activeSession.ref,{status:"ended",endedAt:serverTimestamp()});}
  catch(error){console.warn("Could not close editing session:",error);}
  activeSession=null;
}
async function openSectionEditor(id){
  if(isFuturePractice(practice))return;
  if(editingList)await closeListEditor();
  const section=sectionDef(id);if(!section)return;
  editingSection=id;
  $("section-editor-title").textContent="Edit "+section.title;
  $("section-markdown").value=sections[id]?.content||"";
  $("markdown-preview").innerHTML=markdownToHtml($("section-markdown").value);
  $("section-editor-modal").classList.add("open");$("section-editor-modal").setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
  $("section-markdown").focus();
  try{await startEditSession("section:"+id);}catch(error){console.error("Editor session could not start:",error);showToast("Editing-time tracking is unavailable, but you can still save your changes.","warning");}
}
async function closeSectionEditor(){
  $("section-editor-modal").classList.remove("open");$("section-editor-modal").setAttribute("aria-hidden","true");
  document.body.style.overflow="";
  editingSection=null;
  await endEditSession();
}
async function saveSection(){
  if(!editingSection||!canEdit())return;
  const id=editingSection,button=$("section-save"),before=String(sections[id]?.content||""),after=$("section-markdown").value.trim();
  if(before===after){await closeSectionEditor();return;}
  button.disabled=true;button.textContent="Saving…";
  try{
    await setDoc(doc(db,"practices",practice.id,"documentSections",id),{
      content:after,updatedAt:serverTimestamp(),updatedBy:user.uid,updatedByName:name()
    },{merge:true});
    await recordContribution("Edited section",sectionDef(id).title,id,before,after);
    await syncCompleteness();
    showToast("Section saved.","success");
    await closeSectionEditor();
  }catch(error){console.error("Section save failed:",error);showToast("Could not save section: "+error.message,"error",7000);}
  finally{button.disabled=false;button.textContent="Save changes";}
}
function canEdit(){
  if(isFuturePractice(practice)){showToast("This practice has not started. Editing is locked until its scheduled start time.","warning");return false;}
  return true;
}
function renderItems(){
  const renderGroup=(type,target)=>{
    const rows=items.filter(item=>item.type===type);
    $(target).innerHTML=rows.length?'<ul class="document-item-list">'+rows.map(item=>{
      const done=item.status==="complete";
      return '<li class="document-item '+(done?"is-complete":"")+'><div><span class="document-item-text">'+esc(item.text)+'</span><div class="document-item-meta">'+esc(item.category||"General")+' · Added by '+esc(item.createdByName||"Team member")+'</div></div>'+(editingList===type?'<div class="document-item-controls">'+(type==="next"?'<button class="btn btn-outline btn-xs" data-complete="'+item.id+'" type="button">'+(done?"Reopen":"Complete")+'</button>':"")+'<button class="btn btn-outline btn-xs" data-edit-item="'+item.id+'" type="button">Edit</button><button class="btn btn-outline btn-xs" data-delete-item="'+item.id+'" type="button">Remove</button></div>':"")+'</li>';
    }).join("")+'</ul>':'<p class="document-empty">Nothing has been added yet.</p>';
    $("edit-"+(type==="work"?"work":"next")+"-list").textContent=editingList===type?"Done":"Edit list";
    $("edit-"+(type==="work"?"work":"next")+"-list").disabled=isFuturePractice(practice);
    $(""+type+"-add-form").hidden=editingList!==type;
  };
  renderGroup("work","work-items");renderGroup("next","next-items");
  document.querySelectorAll("[data-edit-item]").forEach(b=>b.addEventListener("click",()=>openItemEditor(b.dataset.editItem)));
  document.querySelectorAll("[data-delete-item]").forEach(b=>b.addEventListener("click",()=>removeItem(b.dataset.deleteItem)));
  document.querySelectorAll("[data-complete]").forEach(b=>b.addEventListener("click",()=>toggleItem(b.dataset.complete)));
}
async function openListEditor(type){
  if(!canEdit())return;
  if(editingSection)return;
  if(editingList===type){await closeListEditor();return;}
  if(activeSession)await endEditSession();
  editingList=type;renderItems();
  try{await startEditSession(type+"-list");}catch(error){console.error("List editing session failed:",error);}
}
async function closeListEditor(){
  editingList=null;renderItems();await endEditSession();
}
async function addItem(type){
  if(!canEdit())return;
  const input=$(type+"-text"),category=$(type+"-category"),text=input.value.trim();
  if(!text){input.focus();return;}
  try{
    const ref=await addDoc(collection(db,"practices",practice.id,"documentItems"),{
      type,text,category:category.value||"General",status:"open",createdBy:user.uid,createdByName:name(),
      updatedBy:user.uid,updatedByName:name(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    await recordContribution(type==="work"?"Added work item":"Added next step",text,"","",text);
    input.value="";if(type==="work")await syncCompleteness();showToast("Added to the shared document.","success");
  }catch(error){showToast("Could not add item: "+error.message,"error",7000);}
}
function openItemEditor(id){
  const item=items.find(x=>x.id===id);if(!item||!canEdit())return;
  editingItem=item;
  $("item-editor-title").textContent=item.type==="work"?"Edit completed work":"Edit next step";
  $("item-editor-text").value=item.text;$("item-editor-category").value=item.category||"General";
  $("item-editor-modal").classList.add("open");
}
async function closeItemEditor(){
  $("item-editor-modal").classList.remove("open");editingItem=null;
}
async function saveItem(){
  if(!editingItem||!canEdit())return;
  const item=editingItem,after=$("item-editor-text").value.trim(),category=$("item-editor-category").value;
  if(!after){showToast("Enter a description before saving.","warning");return;}
  const before=item.text;
  try{
    await updateDoc(doc(db,"practices",practice.id,"documentItems",item.id),{text:after,category,updatedAt:serverTimestamp(),updatedBy:user.uid,updatedByName:name()});
    await recordContribution("Edited item",after,"",before,after);
    await closeItemEditor();
  }catch(error){showToast("Could not update item: "+error.message,"error",7000);}
}
async function removeItem(id){
  const item=items.find(x=>x.id===id);if(!item||!canEdit()||!confirm("Remove this item from the practice document?"))return;
  try{
    await deleteDoc(doc(db,"practices",practice.id,"documentItems",id));
    await recordContribution("Removed item",item.text,"",item.text,"");if(item.type==="work")await syncCompleteness();
  }catch(error){showToast("Could not remove item: "+error.message,"error",7000);}
}
async function toggleItem(id){
  const item=items.find(x=>x.id===id);if(!item||!canEdit())return;
  const status=item.status==="complete"?"open":"complete";
  try{
    await updateDoc(doc(db,"practices",practice.id,"documentItems",id),{status,updatedAt:serverTimestamp(),updatedBy:user.uid,updatedByName:name()});
    await recordContribution(status==="complete"?"Completed next step":"Reopened next step",item.text);
  }catch(error){showToast("Could not update next step: "+error.message,"error",7000);}
}
async function importLegacyLogs(){
  if(!canEdit()||meta.legacyImported)return;
  const button=$("import-legacy-button");button.disabled=true;button.textContent="Importing…";
  try{
    const snap=await getDocs(collection(db,"practices",practice.id,"logs"));
    if(snap.empty){showToast("No older member logs were found for this practice.","info");return;}
    const reflections=[];
    for(const entry of snap.docs){
      const log=entry.data(),member=String(log.memberName||log.memberEmail||"Previous team member"),uid=String(log.userId||entry.id);
      let tasks=Array.isArray(log.tasks)?log.tasks.map(t=>({text:String(t?.text||"").trim(),category:String(t?.category||"General")})).filter(t=>t.text):[];
      if(!tasks.length&&Array.isArray(log.selectedPresets))tasks=log.selectedPresets.map((text,i)=>({text:String(text||"").trim(),category:(log.workAreas||[])[i]||(log.workAreas||[])[0]||"General"})).filter(t=>t.text);
      if(!tasks.length&&log.majorAccomplishment)tasks=[{text:String(log.majorAccomplishment).trim(),category:(log.workAreas||[])[0]||"General"}];
      let next=Array.isArray(log.nextSteps)?log.nextSteps.map(s=>({text:String(s?.text||"").trim(),category:String(s?.category||"General")})).filter(s=>s.text):[];
      if(!next.length&&log.nextStep)next=[{text:String(log.nextStep).trim(),category:(log.workAreas||[])[0]||"General"}];
      for(let i=0;i<tasks.length;i++)await setDoc(doc(db,"practices",practice.id,"documentItems","legacy_"+entry.id+"_work_"+i),{
        type:"work",text:tasks[i].text,category:tasks[i].category,status:"open",createdBy:uid,createdByName:member,updatedBy:uid,updatedByName:member,legacyImport:true,createdAt:log.createdAt||serverTimestamp(),updatedAt:serverTimestamp()
      },{merge:true});
      for(let i=0;i<next.length;i++)await setDoc(doc(db,"practices",practice.id,"documentItems","legacy_"+entry.id+"_next_"+i),{
        type:"next",text:next[i].text,category:next[i].category,status:"open",createdBy:uid,createdByName:member,updatedBy:uid,updatedByName:member,legacyImport:true,createdAt:log.createdAt||serverTimestamp(),updatedAt:serverTimestamp()
      },{merge:true});
      const learned=String(log.learned||log.lesson||"").trim();if(learned)reflections.push(member+": "+learned);
      const words=wordTokens([...tasks.map(x=>x.text),...next.map(x=>x.text),learned].join(" ")).length;
      await setDoc(doc(db,"practices",practice.id,"documentContributors",uid),{
        userId:uid,memberName:member,contributionCount:increment(1),wordsAdded:increment(words),
        wordsRemoved:increment(0),activeEditingMs:increment(0),lastAction:"Imported legacy practice log",
        lastActionAt:log.updatedAt||log.createdAt||serverTimestamp(),updatedAt:serverTimestamp()
      },{merge:true});
      await addDoc(collection(db,"practices",practice.id,"documentHistory"),{
        action:"Imported legacy practice log",detail:"Imported the earlier member entry.",userId:uid,memberName:member,
        wordsAdded:words,wordsRemoved:0,createdAt:log.updatedAt||log.createdAt||serverTimestamp(),legacyImport:true
      });
    }
    if(reflections.length){
      const ref=doc(db,"practices",practice.id,"documentSections","lessons"),existing=await getDoc(ref);
      const current=String(existing.data()?.content||"").trim();
      await setDoc(ref,{content:[current,...reflections.map(x=>"- "+x)].filter(Boolean).join("\n\n"),updatedAt:serverTimestamp(),updatedBy:user.uid,updatedByName:name()},{merge:true});
    }
    await setDoc(doc(db,"practices",practice.id,"documentMeta","main"),{legacyImported:true,legacyImportedAt:serverTimestamp()},{merge:true});
    await recordContribution("Imported older logs",snap.size+" previous member entries combined into this practice document.");
    await syncCompleteness();showToast("Imported "+snap.size+" older entries. Original logs were preserved.","success",7000);
  }catch(error){console.error("Legacy import failed:",error);showToast("Import failed: "+error.message,"error",8000);}
  finally{button.disabled=false;button.textContent="Import older logs";}
}
function renderContributors(){
  const sorted=contributors.slice().sort((a,b)=>(b.contributionCount||0)-(a.contributionCount||0));
  $("contributors-list").innerHTML=sorted.length?'<div class="contributors-grid">'+sorted.map(person=>'<article class="contributor-card"><strong>'+esc(person.memberName||"Team member")+'</strong><span>'+Number(person.contributionCount||0)+' contributions</span><small>'+Number(person.wordsAdded||0).toLocaleString()+" words added · "+formatDuration(person.activeEditingMs)+" active editing time</small><small>Last contribution: "+esc(formatDate(person.lastActionAt))+'</small></article>').join("")+'</div>':'<p class="document-empty">No one has contributed yet.</p>';
}
function renderItemsAndContributors(){
  renderItems();renderContributors();
}
function renderAttendance(){
  $("attendance-status").textContent=attendance?.status==="not_present"?"You are marked not present":attendance?.status==="attending"?"You are marked present":"Attendance not marked";
  $("attendance-present").classList.toggle("btn-primary",attendance?.status!=="not_present");
  $("attendance-absent").classList.toggle("btn-danger",attendance?.status==="not_present");
}
function subscribe(){
  const root=["practices",practice.id];
  unsubs.push(onSnapshot(collection(db,...root,"documentSections"),snap=>{
    sections={};snap.docs.forEach(d=>sections[d.id]=d.data());renderSections();
  },error=>showToast("Document sections could not load: "+error.message,"error",7000)));
  unsubs.push(onSnapshot(collection(db,...root,"documentItems"),snap=>{
    items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.createdAt?.toMillis?.()||0)-(b.createdAt?.toMillis?.()||0));renderItems();
  },error=>showToast("Work items could not load: "+error.message,"error",7000)));
  unsubs.push(onSnapshot(collection(db,...root,"documentContributors"),snap=>{
    contributors=snap.docs.map(d=>({id:d.id,...d.data()}));renderContributors();
  },error=>showToast("Contributors could not load: "+error.message,"error",7000)));
  unsubs.push(onSnapshot(doc(db,...root,"documentMeta","main"),snap=>{
    meta=snap.exists()?snap.data():{};renderLastEdited();$("import-legacy-button").hidden=Boolean(meta.legacyImported);
  },error=>console.warn("Document metadata unavailable:",error)));
  unsubs.push(onSnapshot(doc(db,...root,"attendance",user.uid),snap=>{
    attendance=snap.exists()?snap.data():null;renderAttendance();
  },error=>console.warn("Attendance status unavailable:",error)));
}
function bindControls(){
  $("edit-practice").addEventListener("click",()=>openPracticeEditor(practice));
  $("delete-practice").addEventListener("click",async()=>{
    if(!confirm("Delete this practice and all its documentation? This cannot be undone."))return;
    const button=$("delete-practice");button.disabled=true;button.textContent="Deleting…";
    try{await deletePracticeCompletely(practice.id);location.href="./practices.html";}
    catch(error){button.disabled=false;button.textContent="Delete practice";showToast("Delete failed: "+error.message,"error",8000);}
  });
  $("attendance-present").addEventListener("click",()=>saveAttendance("attending"));
  $("attendance-absent").addEventListener("click",()=>saveAttendance("not_present"));
  $("edit-work-list").addEventListener("click",()=>openListEditor("work"));
  $("edit-next-list").addEventListener("click",()=>openListEditor("next"));
  $("work-add").addEventListener("click",()=>addItem("work"));
  $("next-add").addEventListener("click",()=>addItem("next"));
  $("import-legacy-button").addEventListener("click",importLegacyLogs);
  $("section-save").addEventListener("click",saveSection);
  $("section-cancel").addEventListener("click",closeSectionEditor);
  $("section-editor-close").addEventListener("click",closeSectionEditor);
  $("section-markdown").addEventListener("input",()=>{$("markdown-preview").innerHTML=markdownToHtml($("section-markdown").value);});
  $("markdown-show-preview").addEventListener("click",()=>{$("markdown-editor-pane").hidden=true;$("markdown-preview-pane").hidden=false;});
  $("markdown-show-write").addEventListener("click",()=>{$("markdown-preview-pane").hidden=true;$("markdown-editor-pane").hidden=false;$("section-markdown").focus();});
  $("section-editor-modal").addEventListener("click",e=>{if(e.target.id==="section-editor-modal")closeSectionEditor();});
  $("item-editor-cancel").addEventListener("click",closeItemEditor);
  $("item-editor-close").addEventListener("click",closeItemEditor);
  $("item-editor-modal").addEventListener("click",e=>{if(e.target.id==="item-editor-modal")closeItemEditor();});
  $("item-editor-form").addEventListener("submit",e=>{e.preventDefault();saveItem();});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushEditSession(true);else if(activeSession)activeSession.lastTick=Date.now();});
  window.addEventListener("pagehide",()=>{if(activeSession)flushEditSession(true);});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(editingSection)closeSectionEditor();if(editingItem)closeItemEditor();}});
}
async function saveAttendance(status){
  try{await setDoc(doc(db,"practices",practice.id,"attendance",user.uid),{userId:user.uid,memberName:name(),status,updatedAt:serverTimestamp()},{merge:true});showToast("Attendance updated.","success");}
  catch(error){showToast("Attendance could not be updated: "+error.message,"error",7000);}
}
export async function initializeSharedDocument(authUser){
  user=authUser;
  const practiceId=new URLSearchParams(location.search).get("id")||new URLSearchParams(location.search).get("practiceId");
  if(!practiceId){$("document-root").hidden=false;$("document-root").innerHTML='<div class="notice notice-danger">A practice ID is required. Return to Practices and open a practice.</div>';return;}
  try{
    const snap=await getDoc(doc(db,"practices",practiceId));
    if(!snap.exists()||snap.data().deleting){$("document-root").hidden=false;$("document-root").innerHTML='<div class="notice notice-danger">This practice could not be found.</div>';return;}
    practice={id:snap.id,...snap.data()};
    $("doc-practice-title").textContent=practice.title||"Untitled practice";
    $("doc-practice-meta").textContent=formatPracticeSchedule(practice)+(practice.location?" · "+practice.location:"");
    $("future-document-banner").hidden=!isFuturePractice(practice);
    if(isFuturePractice(practice))$("future-document-banner").textContent="This practice has not started. The document is available to read, but editing opens at its scheduled start time.";
    $("section-editor-modal").setAttribute("aria-hidden","true");
    initializePracticeEditor(user,id=>{if(id)location.href="./practice.html?id="+encodeURIComponent(id);});
    bindControls();renderLastEdited();subscribe();$("document-root").hidden=false;
  }catch(error){console.error("Shared document initialization failed:",error);$("document-root").hidden=false;$("document-root").innerHTML='<div class="notice notice-danger">The practice document could not be opened: '+esc(error.message)+'</div>';}
}