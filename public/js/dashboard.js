import { db } from "./firebase.js";
import { collection, collectionGroup, doc, onSnapshot, query, setDoc, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js";

let currentUser = null;
let practices = [];
let myLogs = [];
let latestPracticeLogs = [];
let latestPracticeId = null;

function dateKey() {
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function formatDateKey(key) {
  const p=key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"}).format(new Date(p[0],p[1]-1,p[2]));
}
function esc(value) {
  return String(value||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function myLogFor(id){ return myLogs.find(log=>log.practiceId===id); }

function render() {
  const today=dateKey();
  const todayPractice=practices.find(p=>(p.dateKey||p.id)===today)||null;
  const overdue=practices.filter(p=>{
    const key=p.dateKey||p.id;
    return key<today&&!myLogFor(p.id);
  });

  document.getElementById("stat-practices").textContent=practices.length;
  document.getElementById("stat-my-logs").textContent=myLogs.length;
  document.getElementById("stat-today").textContent=todayPractice?"Yes":"—";
  document.getElementById("stat-overdue").textContent=overdue.length;

  const create=document.getElementById("create-today");
  const todayStatus=document.getElementById("today-status");
  const todayNote=document.getElementById("today-status-note");

  if(!todayPractice){
    create.classList.remove("hidden");
    todayStatus.textContent="Not started";
    todayNote.textContent="Create today's shared practice.";
  }else{
    create.classList.add("hidden");
    const mine=myLogFor(todayPractice.id);
    todayStatus.textContent=mine?"Logged":"Due today";
    todayNote.textContent=mine?"Your documentation is saved.":"Your practice log is still missing.";
  }

  document.getElementById("latest-practice").textContent=practices.length?formatDateKey(practices[0].dateKey||practices[0].id):"—";
  document.getElementById("latest-practice-note").textContent=latestPracticeLogs.length+" member "+(latestPracticeLogs.length===1?"log":"logs");
  document.getElementById("team-completion").textContent=latestPracticeLogs.length;

  document.getElementById("overdue-list").innerHTML=overdue.length
    ? overdue.slice(0,10).map(p=>{
        const key=p.dateKey||p.id;
        const days=Math.max(1,Math.round((new Date(today+"T00:00:00")-new Date(key+"T00:00:00"))/86400000));
        return '<div class="overdue-item"><div><strong>'+esc(formatDateKey(key))+'</strong><span>'+(days===1?"1 day overdue":days+" days overdue")+'</span></div><a class="btn btn-outline btn-sm" href="./my-log.html?practiceId='+encodeURIComponent(p.id)+'">Log it</a></div>';
      }).join("")
    : '<div class="notice notice-success">You are caught up. No past practice logs are missing.</div>';

  const recent=document.getElementById("recent-practices");
  recent.innerHTML=practices.length
    ? practices.slice(0,8).map(p=>{
        const mine=Boolean(myLogFor(p.id));
        const key=p.dateKey||p.id;
        return '<article class="practice-row" data-id="'+esc(p.id)+'"><div class="practice-number">LOG<div class="practice-date">Practice</div></div><div class="practice-main"><h3 class="practice-title">'+esc(formatDateKey(key))+'</h3><p class="practice-description">'+(mine?"Your log is saved.":"Your log is still needed.")+'</p><div class="practice-meta"><span>Shared practice</span><span>•</span><span>Live synced</span></div></div><div class="practice-side"><span class="chip '+(mine?"chip-success":"chip-warning")+'">'+(mine?"Logged":"Needs your log")+'</span></div></article>';
      }).join("")
    : '<div class="empty-state"><div class="empty-icon">▣</div><h3>No practices yet</h3><p>Create the first shared practice to begin the documentation record.</p></div>';

  recent.querySelectorAll("[data-id]").forEach(row=>row.addEventListener("click",()=>location.href="./practice.html?id="+encodeURIComponent(row.dataset.id)));

  document.getElementById("recent-activity").innerHTML=latestPracticeLogs.length
    ? latestPracticeLogs.slice().sort((a,b)=>{
        const av=a.updatedAt?.toMillis?a.updatedAt.toMillis():0;
        const bv=b.updatedAt?.toMillis?b.updatedAt.toMillis():0;
        return bv-av;
      }).slice(0,8).map(log=>'<div class="activity-row"><div class="activity-dot"></div><div class="activity-copy"><strong>'+esc(log.memberName||log.memberEmail||"Team Member")+" — "+esc(log.majorAccomplishment||"Updated a practice log.")+'</strong><span>Latest practice</span></div></div>').join("")
    : '<div class="empty-state"><p>No member documentation has been saved yet.</p></div>';
}

async function createPractice() {
  const key=dateKey();
  try{
    await setDoc(doc(db,"practices",key),{
      title:formatDateKey(key),
      dateKey:key,
      createdBy:currentUser.uid,
      createdByEmail:currentUser.email||"",
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    },{merge:true});
    location.href="./practice.html?id="+encodeURIComponent(key);
  }catch(error){
    console.error("Failed to create practice:",error);
    showToast("Could not create the practice: "+error.message,"error",7000);
  }
}

function startLatestLogListener(id){
  if(id===latestPracticeId)return;
  latestPracticeId=id;
  if(!id){latestPracticeLogs=[];render();return;}

  onSnapshot(
    collection(db,"practices",id,"logs"),
    snapshot=>{
      latestPracticeLogs=snapshot.docs.map(item=>({id:item.id,...item.data()}));
      render();
    },
    error=>{
      console.error("Latest practice logs failed:",error);
      latestPracticeLogs=[];
      render();
      showToast("Latest practice logs could not be loaded: "+error.message,"error",7000);
    }
  );
}

export function initializeDashboard(user) {
  currentUser=user;
  document.getElementById("welcome").textContent="Welcome back, "+((user.displayName||user.email||"team member").split(" ")[0])+".";
  document.getElementById("create-today").addEventListener("click",createPractice);

  onSnapshot(
    collection(db,"practices"),
    snapshot=>{
      practices=snapshot.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>String(b.dateKey||b.id).localeCompare(String(a.dateKey||a.id)));
      startLatestLogListener(practices[0]?.id||null);
      render();
    },
    error=>{
      console.error("Practices listener failed:",error);
      document.getElementById("recent-practices").innerHTML='<div class="notice notice-danger">Practices could not be loaded: '+esc(error.message)+'</div>';
      showToast("Firestore could not read practices: "+error.message,"error",7000);
    }
  );

  onSnapshot(
    query(collectionGroup(db,"logs"),where("userId","==",user.uid)),
    snapshot=>{
      myLogs=snapshot.docs.map(item=>({id:item.id,...item.data()}));
      render();
    },
    error=>{
      console.error("My logs listener failed:",error);
      showToast("Firestore could not read your logs: "+error.message,"error",7000);
    }
  );
}
