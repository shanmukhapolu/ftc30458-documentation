import { collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js?v=20260926-02";
import { initializePracticeEditor, openPracticeEditor, isFuturePractice, formatPracticeSchedule } from "./practice-editor.js?v=20260926-02";

let currentUser=null;
let practices=[];
let myLogsByPractice=new Map();
let myAttendanceByPractice=new Map();
let latestPracticeLogs=[];
let latestPracticeId=null;
let practiceLogUnsubscribers=new Map();
let practiceAttendanceUnsubscribers=new Map();
let latestPracticeUnsubscribe=null;

function todayKey(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function formatDateKey(key){
  const p=String(key).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"}).format(new Date(p[0],p[1]-1,p[2]));
}
function esc(value){return String(value||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function myLogFor(id){return myLogsByPractice.get(id)||null;}
function myAttendanceFor(id){return myAttendanceByPractice.get(id)||null;}
function startMs(practice){return Number.isFinite(Number(practice?.startAtMs))?Number(practice.startAtMs):new Date((practice?.dateKey||"1970-01-01")+"T00:00:00").getTime();}
function endMs(practice){return Number.isFinite(Number(practice?.endAtMs))?Number(practice.endAtMs):startMs(practice)+86400000;}
function statusLabel(practice){
  const now=Date.now(),start=startMs(practice),end=endMs(practice);
  if(start>now)return "Upcoming";
  if(end>now)return "In progress";
  return "Completed";
}
function render(){
  const statPractices=document.getElementById("stat-practices");
  const statMyLogs=document.getElementById("stat-my-logs");
  const statToday=document.getElementById("stat-today");
  const statOverdue=document.getElementById("stat-overdue");
  const create=document.getElementById("create-today");
  const todayStatus=document.getElementById("today-status");
  const todayNote=document.getElementById("today-status-note");
  const recent=document.getElementById("recent-practices");
  const overdueList=document.getElementById("overdue-list");
  const latestPractice=document.getElementById("latest-practice");
  const latestPracticeNote=document.getElementById("latest-practice-note");
  const teamCompletion=document.getElementById("team-completion");
  const recentActivity=document.getElementById("recent-activity");
  if(!statPractices||!statMyLogs||!statToday||!statOverdue||!create||!todayStatus||!todayNote||!recent||!overdueList||!latestPractice||!latestPracticeNote||!teamCompletion||!recentActivity)return;

  const today=todayKey();
  const todayPractices=practices.filter(p=>(p.dateKey||p.id)===today).sort((a,b)=>startMs(a)-startMs(b));
  const activeToday=todayPractices.find(p=>!isFuturePractice(p)&&endMs(p)>=Date.now())||todayPractices[0]||null;
  const overdue=practices.filter(p=>endMs(p)<Date.now()&&!myLogFor(p.id)&&myAttendanceFor(p.id)?.status!=="not_present");
  const myLogCount=[...myLogsByPractice.values()].filter(Boolean).length;

  statPractices.textContent=practices.length;
  statMyLogs.textContent=myLogCount;
  statToday.textContent=activeToday?(isFuturePractice(activeToday)?"Upcoming":"Yes"):"—";
  statOverdue.textContent=overdue.length;

  create.classList.remove("hidden");
  if(!todayPractices.length){
    todayStatus.textContent="No practice scheduled";
    todayNote.textContent="Add a practice for today.";
  }else{
    const mine=activeToday?myLogFor(activeToday.id):null;
    if(activeToday&&isFuturePractice(activeToday)){
      todayStatus.textContent="Upcoming";
      todayNote.textContent=formatPracticeSchedule(activeToday);
    }else if(activeToday&&myAttendanceFor(activeToday.id)?.status==="not_present"){
      todayStatus.textContent="Not present";
      todayNote.textContent="No log required.";
    }else if(mine){
      todayStatus.textContent="Logged";
      todayNote.textContent="Your documentation is saved.";
    }else{
      todayStatus.textContent="Due";
      todayNote.textContent="Your current practice log is still missing.";
    }
  }

  latestPractice.textContent=practices.length?(practices[0].title||formatDateKey(practices[0].dateKey||practices[0].id)):"—";
  latestPracticeNote.textContent=practices.length?formatPracticeSchedule(practices[0]):"No practice yet";
  teamCompletion.textContent=latestPracticeLogs.length;

  overdueList.innerHTML=overdue.length
    ? overdue.slice(0,10).map(p=>{
        return '<div class="overdue-item"><div><strong>'+esc(p.title||formatDateKey(p.dateKey||p.id))+'</strong><span>'+esc(formatPracticeSchedule(p))+'</span></div><a class="btn btn-outline btn-sm" href="./log-entry.html?practiceId='+encodeURIComponent(p.id)+'">Log it</a></div>';
      }).join("")
    : '<div class="notice notice-success">You are caught up. No past practice logs are missing.</div>';

  recent.innerHTML=practices.length
    ? practices.slice(0,8).map(p=>{
        const mine=Boolean(myLogFor(p.id));
        const absent=myAttendanceFor(p.id)?.status==="not_present";
        const future=isFuturePractice(p);
        const status=absent?"Not present":future?"Upcoming":mine?"Logged":"Needs your log";
        const chip=absent?"chip-neutral":future?"chip-primary":mine?"chip-success":"chip-warning";
        return '<article class="practice-row" data-id="'+esc(p.id)+'"><div class="practice-number">LOG<div class="practice-date">'+esc(statusLabel(p))+'</div></div><div class="practice-main"><div class="practice-title-line"><h3 class="practice-title">'+esc(p.title||"Untitled practice")+'</h3><span class="chip '+chip+'">'+esc(status)+'</span></div><p class="practice-description">'+esc(formatPracticeSchedule(p))+(p.location?" · "+esc(p.location):"")+'</p><div class="practice-meta"><span>Shared practice</span><span>•</span><span>Synced for everyone</span></div></div><div class="practice-side"><span class="chip '+chip+'">'+esc(status)+'</span></div></article>';
      }).join("")
    : '<div class="empty-state"><div class="empty-icon">▣</div><h3>No practices yet</h3><p>Create the first shared practice to begin the documentation record.</p></div>';

  recent.querySelectorAll("[data-id]").forEach(row=>row.addEventListener("click",()=>location.href="./practice.html?id="+encodeURIComponent(row.dataset.id)));

  recentActivity.innerHTML=latestPracticeLogs.length
    ? latestPracticeLogs.slice().sort((a,b)=>(b.updatedAt?.toMillis?b.updatedAt.toMillis():0)-(a.updatedAt?.toMillis?a.updatedAt.toMillis():0)).slice(0,8)
      .map(log=>{
        const taskText=Array.isArray(log.tasks)&&log.tasks.length?log.tasks[0].text:(log.majorAccomplishment||"Updated a practice log.");
        return '<div class="activity-row"><div class="activity-dot"></div><div class="activity-copy"><strong>'+esc(log.memberName||log.memberEmail||"Team Member")+" — "+esc(taskText)+'</strong><span>Latest practice</span></div></div>';
      }).join("")
    : '<div class="empty-state"><p>No member documentation has been saved yet.</p></div>';
}

function syncPracticeLogListeners(){
  const activeIds=new Set(practices.map(p=>p.id));
  for(const [practiceId,unsubscribe] of practiceLogUnsubscribers){
    if(!activeIds.has(practiceId)){
      unsubscribe();
      practiceLogUnsubscribers.delete(practiceId);
      myLogsByPractice.delete(practiceId);
    }
  }
  practices.forEach(practice=>{
    if(practiceLogUnsubscribers.has(practice.id))return;
    const unsubscribe=onSnapshot(doc(db,"practices",practice.id,"logs",currentUser.uid),snapshot=>{
      if(snapshot.exists())myLogsByPractice.set(practice.id,{id:snapshot.id,...snapshot.data()});
      else myLogsByPractice.delete(practice.id);
      render();
    },error=>{
      console.error("My log failed for "+practice.id+":",error);
      myLogsByPractice.delete(practice.id);
      render();
    });
    practiceLogUnsubscribers.set(practice.id,unsubscribe);
  });
}
function syncAttendanceListeners(){
  const activeIds=new Set(practices.map(p=>p.id));
  for(const [practiceId,unsubscribe] of practiceAttendanceUnsubscribers){
    if(!activeIds.has(practiceId)){
      unsubscribe();
      practiceAttendanceUnsubscribers.delete(practiceId);
      myAttendanceByPractice.delete(practiceId);
    }
  }
  practices.forEach(practice=>{
    if(practiceAttendanceUnsubscribers.has(practice.id))return;
    const unsubscribe=onSnapshot(doc(db,"practices",practice.id,"attendance",currentUser.uid),snapshot=>{
      if(snapshot.exists())myAttendanceByPractice.set(practice.id,snapshot.data());
      else myAttendanceByPractice.delete(practice.id);
      render();
    },error=>{
      console.error("Attendance failed for "+practice.id+":",error);
      myAttendanceByPractice.delete(practice.id);
      render();
    });
    practiceAttendanceUnsubscribers.set(practice.id,unsubscribe);
  });
}
function startLatestLogListener(id){
  if(id===latestPracticeId)return;
  latestPracticeId=id;
  if(latestPracticeUnsubscribe){latestPracticeUnsubscribe();latestPracticeUnsubscribe=null;}
  if(!id){latestPracticeLogs=[];render();return;}
  latestPracticeUnsubscribe=onSnapshot(collection(db,"practices",id,"logs"),snapshot=>{
    latestPracticeLogs=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    render();
  },error=>{
    console.error("Latest practice logs failed:",error);
    latestPracticeLogs=[];
    render();
    showToast("Latest practice logs could not be loaded: "+error.message,"error",7000);
  });
}
export function initializeDashboard(user){
  currentUser=user;
  const welcome=document.getElementById("welcome");
  const createButton=document.getElementById("create-today");
  const recent=document.getElementById("recent-practices");
  if(!welcome||!createButton||!recent){
    console.error("Dashboard could not initialize: required DOM elements are missing.");
    return;
  }
  welcome.textContent="Welcome back, "+((user.displayName||user.email||"team member").split(" ")[0])+".";
  initializePracticeEditor(user,savedId=>{
    if(savedId)location.href="./practice.html?id="+encodeURIComponent(savedId);
  });
  createButton.addEventListener("click",()=>openPracticeEditor());
  onSnapshot(collection(db,"practices"),snapshot=>{
    practices=snapshot.docs.map(item=>({id:item.id,...item.data()}))
      .filter(item=>item.deleting!==true)
      .sort((a,b)=>startMs(b)-startMs(a));
    syncPracticeLogListeners();
    syncAttendanceListeners();
    startLatestLogListener(practices[0]?.id||null);
    render();
  },error=>{
    console.error("Practices listener failed:",error);
    recent.innerHTML='<div class="notice notice-danger">Practices could not be loaded: '+esc(error.message)+'</div>';
    showToast("Firestore could not read practices: "+error.message,"error",7000);
  });
}
