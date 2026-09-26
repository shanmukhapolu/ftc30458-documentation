import { db } from "./firebase.js?v=20260926-02";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js?v=20260926-02";
import { deletePracticeCompletely } from "./practice-delete.js?v=20260926-02";
import {
  initializePracticeEditor,
  openPracticeEditor,
  isFuturePractice,
  formatPracticeSchedule
} from "./practice-editor.js?v=20260926-02";

let currentUser=null;
let practices=[];
let allLogsByPractice=new Map();
let allAttendanceByPractice=new Map();
let logUnsubscribers=new Map();
let attendanceUnsubscribers=new Map();

function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function practiceDateTimeMs(practice){
  if(Number.isFinite(Number(practice?.startAtMs)))return Number(practice.startAtMs);
  const [y,m,d]=String(practice?.dateKey||"").split("-").map(Number);
  return new Date(y,m-1,d).getTime();
}

function stateLabel(practice){
  const start=practiceDateTimeMs(practice);
  const now=Date.now();
  if(start>now)return '<span class="chip chip-primary">Upcoming</span>';
  return '<span class="chip chip-neutral">Completed</span>';
}

function myAttendance(practiceId){
  const records=allAttendanceByPractice.get(practiceId)||[];
  return records.find(item=>item.id===currentUser.uid)?.status || "attending";
}

function render(){
  const list=document.getElementById("practice-list");
  const searchInput=document.getElementById("practice-search");
  if(!list||!searchInput){
    console.error("Practices page could not render: required DOM elements are missing.");
    return;
  }

  const search=searchInput.value.trim().toLowerCase();
  const filtered=practices.filter(practice=>{
    const haystack=[
      practice.title,
      practice.dateKey,
      practice.location,
      practice.description,
      formatPracticeSchedule(practice)
    ].join(" ").toLowerCase();
    return !search||haystack.includes(search);
  });

  if(!filtered.length){
    list.innerHTML='<div class="card-shell"><div class="empty-state"><div class="empty-icon">▣</div><h3>No practices found</h3><p>Create a practice or change your search.</p></div></div>';
    return;
  }

  list.innerHTML=filtered.map(practice=>{
    const logs=allLogsByPractice.get(practice.id)||[];
    const attendance=myAttendance(practice.id);
    const hasLog=logs.some(log=>log.id===currentUser.uid);
    const future=isFuturePractice(practice);

    let statusChip=hasLog
      ? '<span class="chip chip-success">Your log saved</span>'
      : attendance==="not_present"
        ? '<span class="chip chip-neutral">Not present</span>'
        : future
          ? '<span class="chip chip-primary">Logging locked</span>'
          : '<span class="chip chip-warning">Your log missing</span>';

    return '<article class="practice-row" tabindex="0" data-id="'+esc(practice.id)+'">'+
      '<div class="practice-number">LOG<div class="practice-date">'+esc(future?"Upcoming":"Practice")+'</div></div>'+
      '<div class="practice-main">'+
        '<div class="practice-title-line"><h3 class="practice-title">'+esc(practice.title||"Untitled practice")+'</h3>'+stateLabel(practice)+'</div>'+
        '<p class="practice-description">'+esc(formatPracticeSchedule(practice))+(practice.location?" · "+esc(practice.location):"")+'</p>'+
        '<div class="practice-meta"><span>'+logs.length+' member '+(logs.length===1?"log":"logs")+'</span><span>•</span><span>Synced for everyone</span>'+(attendance==="not_present"?'<span>•</span><span>You are marked not present</span>':"")+'</div>'+
      '</div>'+
      '<div class="practice-side">'+
        statusChip+
        '<div class="practice-row-actions"><button class="btn btn-outline btn-sm" type="button" data-edit-practice="'+esc(practice.id)+'">Edit</button><button class="btn btn-danger btn-sm" type="button" data-delete-practice="'+esc(practice.id)+'">Delete</button></div>'+
      '</div>'+
    '</article>';
  }).join("");

  list.querySelectorAll("[data-edit-practice]").forEach(button=>{
    button.addEventListener("click",event=>{
      event.stopPropagation();
      const practice=practices.find(item=>item.id===button.dataset.editPractice);
      if(practice)openPracticeEditor(practice);
    });
  });

  list.querySelectorAll("[data-delete-practice]").forEach(button=>{
    button.addEventListener("click",async event=>{
      event.stopPropagation();
      const practice=practices.find(item=>item.id===button.dataset.deletePractice);
      if(!practice)return;
      const confirmed=window.confirm(
        'Delete "'+(practice.title||"this practice")+'" permanently?\n\nThis will permanently delete the practice, all member logs, and attendance records from Firebase. This cannot be undone.'
      );
      if(!confirmed)return;

      button.disabled=true;
      button.textContent="Deleting…";
      try{
        const result=await deletePracticeCompletely(practice.id);
        showToast("Practice deleted. "+result.deletedLogCount+" logs and "+result.deletedAttendanceCount+" attendance records removed.","success",5500);
      }catch(error){
        console.error("Practice deletion failed:",error);
        showToast("Practice deletion failed: "+error.message,"error",8000);
        button.disabled=false;
        button.textContent="Delete";
      }
    });
  });

  list.querySelectorAll("[data-id]").forEach(row=>{
    row.addEventListener("click",event=>{
      if(event.target.closest("button"))return;
      location.href="./practice.html?id="+encodeURIComponent(row.dataset.id);
    });
    row.addEventListener("keydown",event=>{
      if(event.key==="Enter"||event.key===" "){
        if(event.target.closest("button"))return;
        event.preventDefault();
        location.href="./practice.html?id="+encodeURIComponent(row.dataset.id);
      }
    });
  });
}

function syncLogListeners(){
  const activeIds=new Set(practices.map(p=>p.id));
  for(const [practiceId,unsubscribe] of logUnsubscribers){
    if(!activeIds.has(practiceId)){
      unsubscribe();
      logUnsubscribers.delete(practiceId);
      allLogsByPractice.delete(practiceId);
    }
  }
  practices.forEach(practice=>{
    if(logUnsubscribers.has(practice.id))return;
    const unsubscribe=onSnapshot(
      collection(db,"practices",practice.id,"logs"),
      snapshot=>{
        allLogsByPractice.set(practice.id,snapshot.docs.map(item=>({id:item.id,...item.data()})));
        render();
      },
      error=>{
        console.error("Practice logs failed for "+practice.id+":",error);
        allLogsByPractice.set(practice.id,[]);
        render();
      }
    );
    logUnsubscribers.set(practice.id,unsubscribe);
  }
}

function syncAttendanceListeners(){
  const activeIds=new Set(practices.map(p=>p.id));
  for(const [practiceId,unsubscribe] of attendanceUnsubscribers){
    if(!activeIds.has(practiceId)){
      unsubscribe();
      attendanceUnsubscribers.delete(practiceId);
      allAttendanceByPractice.delete(practiceId);
    }
  }
  practices.forEach(practice=>{
    if(attendanceUnsubscribers.has(practice.id))return;
    const unsubscribe=onSnapshot(
      collection(db,"practices",practice.id,"attendance"),
      snapshot=>{
        allAttendanceByPractice.set(practice.id,snapshot.docs.map(item=>({id:item.id,...item.data()})));
        render();
      },
      error=>{
        console.error("Practice attendance failed for "+practice.id+":",error);
        allAttendanceByPractice.set(practice.id,[]);
        render();
      }
    );
    attendanceUnsubscribers.set(practice.id,unsubscribe);
  });
}

export function initializePractices(user){
  currentUser=user;
  const createButton=document.getElementById("create-practice");
  const searchInput=document.getElementById("practice-search");
  const list=document.getElementById("practice-list");
  if(!createButton||!searchInput||!list){
    console.error("Practices page could not initialize: required DOM elements are missing.");
    return;
  }

  initializePracticeEditor(user,savedId=>{
    if(savedId)location.href="./practice.html?id="+encodeURIComponent(savedId);
  });
  createButton.addEventListener("click",()=>openPracticeEditor());
  searchInput.addEventListener("input",render);

  onSnapshot(
    collection(db,"practices"),
    snapshot=>{
      practices=snapshot.docs.map(item=>({id:item.id,...item.data()}))
        .filter(item=>item.deleting!==true)
        .sort((a,b)=>practiceDateTimeMs(b)-practiceDateTimeMs(a));
      syncLogListeners();
      syncAttendanceListeners();
      render();
    },
    error=>{
      console.error("Practices failed:",error);
      list.innerHTML='<div class="notice notice-danger">Practices could not be loaded: '+esc(error.message)+'</div>';
      showToast("Firestore could not read practices: "+error.message,"error",7000);
    }
  );
}
