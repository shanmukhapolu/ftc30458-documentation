import { db } from "./firebase.js?v=20260926-02";
import { deletePracticeCompletely } from "./practice-delete.js?v=20260926-02";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  initializePracticeEditor,
  openPracticeEditor,
  isFuturePractice,
  formatPracticeSchedule
} from "./practice-editor.js?v=20260926-02";

let currentUser=null;
let practice=null;
let logs=[];
let users=[];
let attendance=null;
let deleting=false;

const LEGACY_CATEGORY="General";

function esc(value){
  return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function initials(name){
  const parts=String(name||"Team Member").trim().split(/\s+/).filter(Boolean);
  return parts.length>=2?(parts[0][0]+parts[parts.length-1][0]).toUpperCase():String(name||"MM").slice(0,2).toUpperCase();
}
function getTasks(log){
  if(Array.isArray(log.tasks))return log.tasks.map(function(task){return{text:String(task?.text||"").trim(),category:String(task?.category||LEGACY_CATEGORY).trim()||LEGACY_CATEGORY};}).filter(t=>t.text);
  if(Array.isArray(log.selectedPresets)&&log.selectedPresets.length){
    const areas=Array.isArray(log.workAreas)?log.workAreas:[];
    return log.selectedPresets.map(function(text,index){return{text:String(text||"").trim(),category:areas[index]||areas[0]||LEGACY_CATEGORY};}).filter(t=>t.text);
  }
  if(log.majorAccomplishment)return[{text:String(log.majorAccomplishment).trim(),category:Array.isArray(log.workAreas)&&log.workAreas[0]?log.workAreas[0]:LEGACY_CATEGORY}];
  return [];
}
function getNextSteps(log){
  if(Array.isArray(log.nextSteps))return log.nextSteps.map(function(step){return{text:String(step?.text||"").trim(),category:String(step?.category||LEGACY_CATEGORY).trim()||LEGACY_CATEGORY};}).filter(s=>s.text);
  if(log.nextStep)return[{text:String(log.nextStep).trim(),category:Array.isArray(log.workAreas)&&log.workAreas[0]?log.workAreas[0]:LEGACY_CATEGORY}];
  return [];
}
function getLearned(log){return String(log.learned||log.lesson||"").trim();}
function updatedTime(log){if(log.updatedAt?.toMillis)return log.updatedAt.toMillis();if(log.createdAt?.toMillis)return log.createdAt.toMillis();return 0;}
function groupByCategory(items){
  const grouped=new Map();
  items.forEach(item=>{const category=item.category||LEGACY_CATEGORY;if(!grouped.has(category))grouped.set(category,[]);grouped.get(category).push(item);});
  return grouped;
}
function renderCategoryBoard(items,emptyMessage){
  if(!items.length)return '<div class="empty-state"><p>'+esc(emptyMessage)+'</p></div>';
  return Array.from(groupByCategory(items).entries()).map(function(entry){
    const category=entry[0],categoryItems=entry[1];
    return '<section class="category-group"><div class="category-group-head"><h3>'+esc(category)+'</h3><span class="chip chip-primary">'+categoryItems.length+'</span></div><ul class="practice-task-list">'+
      categoryItems.map(function(item){return '<li><span class="practice-task-bullet">•</span><span class="practice-task-text">'+esc(item.text)+'</span><span class="practice-task-author">'+esc(item.memberName||"Team member")+'</span></li>';}).join("")+
      '</ul></section>';
  }).join("");
}
function renderAttendance(){
  const section=document.getElementById("attendance-section");
  if(!section||!practice)return;

  const status=attendance?.status||"attending";
  const future=isFuturePractice(practice);
  section.innerHTML=
    '<div class="attendance-card-head"><div><div class="eyebrow">Your attendance</div><h3>'+(
      status==="not_present" ? "You are marked not present" : future ? "Are you attending?" : "Were you present?"
    )+'</h3><p>'+(
      status==="not_present"
        ? "You are exempt from submitting a practice log. You can change this back to attending."
        : future
          ? "Mark yourself not present if you already know you will not attend. Logging stays locked until the practice starts."
          : "Mark yourself not present when you did not attend. No log is required when you are marked absent."
    )+'</p></div><div class="attendance-actions">'+
      '<button id="attendance-present" class="btn '+(status!=="not_present"?"btn-primary":"btn-outline")+'" type="button">Attending / Present</button>'+
      '<button id="attendance-absent" class="btn '+(status==="not_present"?"btn-danger":"btn-outline")+'" type="button">Not present</button>'+
    '</div></div>';

  document.getElementById("attendance-present").addEventListener("click",()=>saveAttendance("attending"));
  document.getElementById("attendance-absent").addEventListener("click",()=>saveAttendance("not_present"));
}
async function saveAttendance(status){
  if(!practice)return;
  const buttons=document.querySelectorAll("#attendance-section button");
  buttons.forEach(button=>button.disabled=true);
  try{
    if(status==="not_present"){
      await setDoc(doc(db,"practices",practice.id,"attendance",currentUser.uid),{
        userId:currentUser.uid,
        memberName:currentUser.displayName||currentUser.email||"Team Member",
        status:"not_present",
        updatedAt:serverTimestamp()
      },{merge:true});
    }else{
      await setDoc(doc(db,"practices",practice.id,"attendance",currentUser.uid),{
        userId:currentUser.uid,
        memberName:currentUser.displayName||currentUser.email||"Team Member",
        status:"attending",
        updatedAt:serverTimestamp()
      },{merge:true});
    }
  }catch(error){
    console.error("Attendance update failed:",error);
    alert("Attendance could not be updated: "+error.message);
    buttons.forEach(button=>button.disabled=false);
  }
}
function renderMemberModal(log){
  const tasks=getTasks(log),nextSteps=getNextSteps(log);
  let html='<div class="log-modal-member-meta"><span class="chip chip-primary">'+esc(log.memberName||"Team member")+'</span></div>'+
    '<div class="log-view-block"><div class="log-view-label">Tasks completed</div><div class="modal-category-board">'+renderCategoryBoard(tasks.map(t=>({...t,memberName:""})),"No completed tasks.")+'</div></div>';
  if(getLearned(log))html+='<div class="log-view-block"><div class="log-view-label">What they learned</div><div class="log-view-text">'+esc(getLearned(log))+'</div></div>';
  html+='<div class="log-view-block"><div class="log-view-label">Next steps</div><div class="modal-category-board">'+renderCategoryBoard(nextSteps.map(s=>({...s,memberName:""})),"No next steps.")+'</div></div>';
  return html;
}
function openModal(log){
  const modal=document.getElementById("log-modal"),body=document.getElementById("modal-body"),title=document.getElementById("modal-title"),footer=document.getElementById("modal-footer");
  if(!modal||!body||!title||!footer)return;
  title.textContent=log.memberName||"Team member";
  body.innerHTML=renderMemberModal(log);
  footer.innerHTML=log.id===currentUser.uid
    ? '<button id="modal-edit" class="btn btn-primary" type="button">Edit My Log</button>'
    : '<span class="chip chip-neutral">Read only · only the author can edit this log</span>';
  document.getElementById("modal-edit")?.addEventListener("click",()=>window.location.href="./log-entry.html?practiceId="+encodeURIComponent(practice.id));
  modal.classList.add("open");
  document.body.style.overflow="hidden";
}
function closeModal(){
  const modal=document.getElementById("log-modal");
  if(!modal)return;
  modal.classList.remove("open");
  document.body.style.overflow="";
}
function render(){
  if(!practice)return;

  const future=isFuturePractice(practice);
  const tasks=logs.flatMap(log=>getTasks(log).map(task=>({...task,memberName:log.memberName||"Team member"})));
  const nextSteps=logs.flatMap(log=>getNextSteps(log).map(step=>({...step,memberName:log.memberName||"Team member"})));
  const categories=new Set([...tasks,...nextSteps].map(item=>item.category));
  const schedule=formatPracticeSchedule(practice);

  document.getElementById("practice-title").textContent=practice.title||"Untitled practice";
  document.getElementById("practice-eyebrow").textContent=future?"Upcoming practice":"Shared practice record";
  document.getElementById("practice-meta").textContent=future
    ? "Future practice · logging is locked until the scheduled start time."
    : "Shared practice record · "+logs.length+" of "+users.length+" members documented.";
  document.getElementById("practice-schedule").textContent=schedule||"Schedule not set";
  document.getElementById("practice-location").textContent=practice.location||"No location added.";
  document.getElementById("practice-description").textContent=practice.description||"No goals or notes were added.";
  document.getElementById("member-progress").textContent=users.length?logs.length+"/"+users.length:String(logs.length);
  document.getElementById("task-count").textContent=tasks.length;
  document.getElementById("category-count").textContent=categories.size;
  document.getElementById("next-step-count").textContent=nextSteps.length;

  const banner=document.getElementById("future-practice-banner");
  const logButton=document.getElementById("edit-my-log");
  if(future){
    banner.style.display="block";
    banner.textContent="This practice has not started yet. Team members can view the schedule and mark attendance, but practice logs cannot be submitted until the start time.";
    logButton.disabled=true;
    logButton.textContent="Logging locked";
  }else{
    banner.style.display="none";
    logButton.disabled=attendance?.status==="not_present";
    logButton.textContent=attendance?.status==="not_present"?"Log exempt · marked not present":"Log / Edit My Work";
  }

  document.getElementById("team-tasks").innerHTML=renderCategoryBoard(tasks,"Completed tasks will appear here as team members document the practice.");
  document.getElementById("team-next-steps").innerHTML=renderCategoryBoard(nextSteps,"Next steps will appear here as team members document what they plan to do next.");

  const reflectionLogs=logs.filter(log=>getLearned(log));
  document.getElementById("team-reflections").innerHTML=reflectionLogs.length
    ? reflectionLogs.map(log=>'<article class="reflection-card"><div class="reflection-card-head"><strong>'+esc(log.memberName||"Team member")+'</strong><span class="chip chip-neutral">Reflection</span></div><p>'+esc(getLearned(log))+'</p></article>').join("")
    : '<div class="card-shell"><div class="empty-state"><p>Member reflections will appear as logs are submitted.</p></div></div>';

  const memberLogs=document.getElementById("member-logs");
  if(!users.length){
    memberLogs.innerHTML='<div class="card-shell"><div class="empty-state"><p>No team members are registered yet.</p></div></div>';
    renderAttendance();
    return;
  }

  memberLogs.innerHTML=users.map(user=>{
    const log=logs.find(item=>item.id===user.id);
    const mine=user.id===currentUser.uid;
    const taskList=log?getTasks(log):[];
    const nextList=log?getNextSteps(log):[];
    const absent=allAttendanceForUser(user.id)?.status==="not_present";
    return '<article class="member-card" data-log-user="'+esc(user.id)+'" style="cursor:pointer">'+
      '<div class="member-card-top"><div class="avatar">'+esc(initials(user.displayName))+'</div><div><div class="member-name">'+esc(user.displayName||"Team Member")+'</div><div class="member-role">'+esc(user.role||"Team Member")+'</div></div></div>'+
      '<div class="member-meta">'+
        (absent?'<span class="chip chip-neutral">Not present</span>':log?'<span class="chip chip-success">Documented</span>':'<span class="chip chip-warning">Not yet logged</span>')+
        (mine?'<span class="chip chip-primary">You</span>':"")+
      '</div>'+
      '<div class="member-email">'+(log?esc(taskList.slice(0,2).map(t=>t.text).join(" · ")||"Log saved."):absent?"No log required.":mine?"Click to write your practice log.":"No documentation yet.")+'</div>'+
      '<div class="member-meta">'+(log?'<span>'+taskList.length+' task'+(taskList.length===1?"":"s")+'</span><span>•</span><span>'+nextList.length+' next step'+(nextList.length===1?"":"s")+'</span>':"")+'</div>'+
    '</article>';
  }).join("");

  memberLogs.querySelectorAll("[data-log-user]").forEach(card=>{
    card.addEventListener("click",()=>{
      const uid=card.dataset.logUser,log=logs.find(item=>item.id===uid);
      if(uid===currentUser.uid&&!log&&!future&&attendance?.status!=="not_present"){
        window.location.href="./log-entry.html?practiceId="+encodeURIComponent(practice.id);
      }else if(log)openModal(log);
    });
  });

  renderAttendance();
}
function allAttendanceForUser(uid){
  if(uid===currentUser.uid)return attendance;
  return (practice?.attendanceRecords||[]).find(item=>item.id===uid)||null;
}

export function initializePracticePage(user){
  currentUser=user;
  const modal=document.getElementById("log-modal");
  const closeButton=document.getElementById("close-modal");
  const editButton=document.getElementById("edit-my-log");
  const editPracticeButton=document.getElementById("edit-practice");
  const deleteButton=document.getElementById("delete-practice");
  const id=new URLSearchParams(location.search).get("id");

  if(!id){
    document.getElementById("practice-title").textContent="Practice not found";
    return;
  }

  closeButton.addEventListener("click",closeModal);
  modal.addEventListener("click",e=>{if(e.target===modal)closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

  editButton.addEventListener("click",()=>{
    if(isFuturePractice(practice)||attendance?.status==="not_present")return;
    window.location.href="./log-entry.html?practiceId="+encodeURIComponent(id);
  });

  editPracticeButton.addEventListener("click",()=>{
    if(practice)openPracticeEditor(practice);
  });

  deleteButton.addEventListener("click",async()=>{
    if(deleting)return;
    const name=practice?.title||"this practice";
    const confirmed=window.confirm('Delete "'+name+'" permanently?\n\nThis will permanently delete the practice, all member logs, and attendance records from Firebase. This cannot be undone.');
    if(!confirmed)return;
    deleting=true;
    deleteButton.disabled=true;
    editPracticeButton.disabled=true;
    editButton.disabled=true;
    deleteButton.textContent="Deleting…";
    try{
      const result=await deletePracticeCompletely(id);
      window.alert(name+" was permanently deleted. "+result.deletedLogCount+" logs and "+result.deletedAttendanceCount+" attendance records were removed.");
      window.location.replace("./practices.html");
    }catch(error){
      console.error("Practice deletion failed:",error);
      window.alert("Practice deletion failed: "+error.message);
      deleting=false;
      deleteButton.disabled=false;
      editPracticeButton.disabled=false;
      editButton.disabled=false;
      deleteButton.textContent="Delete Practice";
    }
  });

  initializePracticeEditor(user,savedId=>{
    if(savedId===id) return;
  });

  onSnapshot(doc(db,"practices",id),snapshot=>{
    if(!snapshot.exists()){
      document.getElementById("practice-title").textContent="Practice not found";
      document.getElementById("practice-meta").textContent="This practice record does not exist.";
      editPracticeButton.disabled=true;
      deleteButton.disabled=true;
      editButton.disabled=true;
      return;
    }
    practice={id:snapshot.id,...snapshot.data()};
    render();
  },error=>{
    console.error("Practice read failed:",error);
    document.getElementById("practice-title").textContent="Unable to load practice";
    document.getElementById("practice-meta").textContent=error.message;
  });

  onSnapshot(collection(db,"practices",id,"logs"),snapshot=>{
    logs=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    render();
  },error=>{
    console.error("Practice logs failed:",error);
    document.getElementById("team-tasks").innerHTML='<div class="notice notice-danger">Logs could not be loaded: '+esc(error.message)+'</div>';
  });

  onSnapshot(doc(db,"practices",id,"attendance",currentUser.uid),snapshot=>{
    attendance=snapshot.exists()?snapshot.data():null;
    render();
  },error=>{
    console.error("Attendance read failed:",error);
  });

  onSnapshot(collection(db,"practices",id,"attendance"),snapshot=>{
    if(practice)practice.attendanceRecords=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    render();
  },error=>{
    console.error("Attendance records failed:",error);
  });

  onSnapshot(collection(db,"users"),snapshot=>{
    users=snapshot.docs.filter(item=>item.data().active!==false).map(item=>({id:item.id,...item.data()}))
      .sort((a,b)=>String(a.displayName||"").localeCompare(String(b.displayName||"")));
    render();
  },error=>{
    console.error("Team read failed:",error);
    document.getElementById("member-logs").innerHTML='<div class="notice notice-danger">Team members could not be loaded: '+esc(error.message)+'</div>';
  });
}
