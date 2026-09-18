import { db } from "./firebase.js?v=20260918-02";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js?v=20260918-02";

let currentUser=null;
let practices=[];
let allLogsByPractice=new Map();
let logUnsubscribers=new Map();

function todayKey(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function formatDateKey(key){
  const p=String(key).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"})
    .format(new Date(p[0],p[1]-1,p[2]));
}

function esc(value){
  return String(value||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function render(){
  const list=document.getElementById("practice-list");
  const searchInput=document.getElementById("practice-search");

  if(!list || !searchInput){
    console.error("Practices page could not render: required DOM elements are missing.");
    return;
  }

  const search=searchInput.value.trim().toLowerCase();

  const filtered=practices.filter(p=>{
    const date=formatDateKey(p.dateKey||p.id);
    return !search || date.toLowerCase().includes(search);
  });

  if(!filtered.length){
    list.innerHTML='<div class="card-shell"><div class="empty-state"><div class="empty-icon">▣</div><h3>No practices found</h3><p>Create today&apos;s practice or change your search.</p></div></div>';
    return;
  }

  list.innerHTML=filtered.map(p=>{
    const key=p.dateKey||p.id;
    const logs=allLogsByPractice.get(p.id)||[];
    const mine=logs.some(log=>log.id===currentUser.uid);

    return '<article class="practice-row" tabindex="0" data-id="'+esc(p.id)+'"><div class="practice-number">LOG<div class="practice-date">Practice</div></div><div class="practice-main"><h3 class="practice-title">'+esc(formatDateKey(key))+'</h3><p class="practice-description">'+logs.length+' member '+(logs.length===1?"log":"logs")+' documented.</p><div class="practice-meta"><span>One log per member</span><span>•</span><span>Editable anytime</span><span>•</span><span>Live synced</span></div></div><div class="practice-side"><span class="chip '+(mine?"chip-success":"chip-warning")+'">'+(mine?"Your log saved":"Your log missing")+'</span></div></article>';
  }).join("");

  list.querySelectorAll("[data-id]").forEach(row=>{
    row.addEventListener("click",()=>location.href="./practice.html?id="+encodeURIComponent(row.dataset.id));
    row.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
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
    if(logUnsubscribers.has(practice.id)) return;

    const unsubscribe=onSnapshot(
      collection(db,"practices",practice.id,"logs"),
      snapshot=>{
        allLogsByPractice.set(
          practice.id,
          snapshot.docs.map(item=>({id:item.id,...item.data()}))
        );
        render();
      },
      error=>{
        console.error("Practice logs failed for "+practice.id+":",error);
        allLogsByPractice.set(practice.id,[]);
        render();
        showToast("Logs for "+formatDateKey(practice.dateKey||practice.id)+" could not be loaded: "+error.message,"error",7000);
      }
    );

    logUnsubscribers.set(practice.id,unsubscribe);
  });
}

function createToday(){
  const key=todayKey();

  setDoc(doc(db,"practices",key),{
    title:formatDateKey(key),
    dateKey:key,
    createdBy:currentUser.uid,
    createdByEmail:currentUser.email||"",
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  },{merge:true}).then(()=>{
    location.href="./practice.html?id="+encodeURIComponent(key);
  }).catch(error=>{
    console.error("Failed to create practice:",error);
    showToast("Could not create the practice: "+error.message,"error",7000);
  });
}

export function initializePractices(user){
  currentUser=user;

  const createButton=document.getElementById("create-practice");
  const searchInput=document.getElementById("practice-search");
  const list=document.getElementById("practice-list");

  if(!createButton || !searchInput || !list){
    console.error("Practices page could not initialize: required DOM elements are missing.");
    return;
  }

  createButton.addEventListener("click",createToday);
  searchInput.addEventListener("input",render);

  onSnapshot(
    collection(db,"practices"),
    snapshot=>{
      practices=snapshot.docs
        .map(item=>({id:item.id,...item.data()}))
        .sort((a,b)=>String(b.dateKey||b.id).localeCompare(String(a.dateKey||a.id)));

      syncLogListeners();
      render();
    },
    error=>{
      console.error("Practices failed:",error);
      list.innerHTML='<div class="notice notice-danger">Practices could not be loaded: '+esc(error.message)+'</div>';
      showToast("Firestore could not read practices: "+error.message,"error",7000);
    }
  );
}
