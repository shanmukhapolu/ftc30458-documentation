import { db } from "./firebase.js";
import { doc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let currentUser=null;
let practice=null;
let logs=[];
let users=[];

function esc(value){
  return String(value||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function initials(name){
  const p=String(name||"Team Member").trim().split(/\s+/).filter(Boolean);
  return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():String(name||"MM").slice(0,2).toUpperCase();
}

function formatDateKey(key){
  const p=String(key).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"})
    .format(new Date(p[0],p[1]-1,p[2]));
}

function pretty(field){
  return field.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase());
}

function closeModal(){
  const modal=document.getElementById("log-modal");
  if(!modal)return;
  modal.classList.remove("open");
  document.body.style.overflow="";
}

function openModal(log){
  const modal=document.getElementById("log-modal");
  const modalBody=document.getElementById("modal-body");
  const modalTitle=document.getElementById("modal-title");
  const modalFooter=document.getElementById("modal-footer");

  if(!modal || !modalBody || !modalTitle || !modalFooter){
    console.error("Practice modal could not open: required DOM elements are missing.");
    return;
  }

  modalTitle.textContent=log.memberName||"Team member";
  modal.classList.add("open");
  document.body.style.overflow="hidden";

  let html="";
  if(log.workAreas?.length)html+='<div class="log-view-block"><div class="log-view-label">Work areas</div><div class="log-view-tags">'+log.workAreas.map(x=>'<span class="chip chip-primary">'+esc(x)+'</span>').join("")+"</div></div>";
  if(log.majorAccomplishment)html+='<div class="log-view-block"><div class="log-view-label">Major accomplishment</div><div class="log-view-text">'+esc(log.majorAccomplishment)+"</div></div>";
  if(log.selectedPresets?.length)html+='<div class="log-view-block"><div class="log-view-label">Quick phrases</div><div class="log-view-tags">'+log.selectedPresets.map(x=>'<span class="chip chip-teal">'+esc(x)+"</span>").join("")+"</div></div>";

  Object.keys(log.details||{}).forEach(area=>{
    const values=log.details[area];
    if(!values||typeof values!=="object")return;
    Object.keys(values).forEach(field=>{
      if(values[field])html+='<div class="log-view-block"><div class="log-view-label">'+esc(pretty(field))+'</div><div class="log-view-text">'+esc(values[field])+"</div></div>";
    });
  });

  if(log.lesson)html+='<div class="log-view-block"><div class="log-view-label">Lesson learned</div><div class="log-view-text">'+esc(log.lesson)+"</div></div>";
  if(log.nextStep)html+='<div class="log-view-block"><div class="log-view-label">Next step</div><div class="log-view-text">'+esc(log.nextStep)+"</div></div>";

  modalBody.innerHTML=html||'<div class="empty-state"><p>No documentation has been added yet.</p></div>';
  modalFooter.innerHTML=log.id===currentUser.uid
    ? '<button id="modal-edit" class="btn btn-primary" type="button">Edit My Log</button>'
    : '<span class="chip chip-neutral">Read only · only the author can edit this log</span>';

  document.getElementById("modal-edit")?.addEventListener("click",()=>{
    location.href="./my-log.html?practiceId="+encodeURIComponent(practice.id);
  });
}

function render(){
  if(!practice)return;

  const title=document.getElementById("practice-title");
  const meta=document.getElementById("practice-meta");
  const memberProgress=document.getElementById("member-progress");
  const workAreaCount=document.getElementById("work-area-count");
  const accomplishmentCount=document.getElementById("accomplishment-count");
  const lastUpdate=document.getElementById("last-update");
  const accomplishments=document.getElementById("accomplishments");
  const memberLogs=document.getElementById("member-logs");

  if(!title||!meta||!memberProgress||!workAreaCount||!accomplishmentCount||!lastUpdate||!accomplishments||!memberLogs){
    console.error("Practice page could not render: required DOM elements are missing.");
    return;
  }

  const key=practice.dateKey||practice.id;
  title.textContent=formatDateKey(key);
  meta.textContent="Shared practice record · "+logs.length+" of "+users.length+" members documented.";

  const areas=new Set();
  logs.forEach(log=>(log.workAreas||[]).forEach(area=>areas.add(area)));

  memberProgress.textContent=users.length?logs.length+"/"+users.length:String(logs.length);
  workAreaCount.textContent=areas.size;
  accomplishmentCount.textContent=logs.filter(log=>Boolean(log.majorAccomplishment)).length;

  const latest=logs
    .map(log=>log.updatedAt?.toMillis?log.updatedAt.toMillis():0)
    .filter(Boolean)
    .sort((a,b)=>b-a)[0];
  lastUpdate.textContent=latest?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(latest)):"—";

  const rows=logs.filter(log=>log.majorAccomplishment);
  accomplishments.innerHTML=rows.length
    ? rows.map(log=>'<div class="accomplishment-row"><strong>'+esc(log.memberName||"Team member")+'</strong><span>— '+esc(log.majorAccomplishment)+'</span></div>').join("")
    : '<div class="empty-state"><p>Member accomplishments will appear here as everyone logs their work.</p></div>';

  if(!users.length){
    memberLogs.innerHTML='<div class="card-shell"><div class="empty-state"><p>No team members are registered yet.</p></div></div>';
    return;
  }

  memberLogs.innerHTML=users.map(user=>{
    const log=logs.find(item=>item.id===user.id);
    const mine=user.id===currentUser.uid;
    return '<article class="member-card" data-log-user="'+esc(user.id)+'" style="cursor:pointer"><div class="member-card-top"><div class="avatar">'+esc(initials(user.displayName))+'</div><div><div class="member-name">'+esc(user.displayName||"Team Member")+'</div><div class="member-role">'+esc(user.role||"Team Member")+'</div></div></div><div class="member-meta">'+(log?'<span class="chip chip-success">Documented</span>':'<span class="chip chip-warning">Not yet logged</span>')+(mine?'<span class="chip chip-primary">You</span>':"")+'</div><div class="member-email">'+(log?.majorAccomplishment?esc(log.majorAccomplishment):(mine?"Click to write your log.":"No documentation yet."))+"</div></article>";
  }).join("");

  memberLogs.querySelectorAll("[data-log-user]").forEach(card=>{
    card.addEventListener("click",()=>{
      const uid=card.dataset.logUser;
      const log=logs.find(item=>item.id===uid);
      if(uid===currentUser.uid&&!log){
        location.href="./my-log.html?practiceId="+encodeURIComponent(practice.id);
      }else if(log){
        openModal(log);
      }
    });
  });
}

export function initializePracticePage(user){
  currentUser=user;

  const modal=document.getElementById("log-modal");
  const closeButton=document.getElementById("close-modal");
  const editButton=document.getElementById("edit-my-log");
  const id=new URLSearchParams(location.search).get("id");

  if(!id){
    document.getElementById("practice-title").textContent="Practice not found";
    return;
  }

  if(!modal || !closeButton || !editButton){
    console.error("Practice page could not initialize: required DOM elements are missing.");
    return;
  }

  editButton.addEventListener("click",()=>location.href="./my-log.html?practiceId="+encodeURIComponent(id));
  closeButton.addEventListener("click",closeModal);
  modal.addEventListener("click",e=>{if(e.target===modal)closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

  onSnapshot(
    doc(db,"practices",id),
    snapshot=>{
      if(!snapshot.exists()){
        document.getElementById("practice-title").textContent="Practice not found";
        document.getElementById("practice-meta").textContent="This practice record does not exist.";
        return;
      }
      practice={id:snapshot.id,...snapshot.data()};
      render();
    },
    error=>{
      console.error("Practice read failed:",error);
      document.getElementById("practice-title").textContent="Unable to load practice";
      document.getElementById("practice-meta").textContent=error.message;
    }
  );

  onSnapshot(
    collection(db,"practices",id,"logs"),
    snapshot=>{
      logs=snapshot.docs.map(item=>({id:item.id,...item.data()}));
      render();
    },
    error=>{
      console.error("Practice logs failed:",error);
      document.getElementById("accomplishments").innerHTML='<div class="notice notice-danger">Logs could not be loaded: '+esc(error.message)+'</div>';
    }
  );

  onSnapshot(
    collection(db,"users"),
    snapshot=>{
      users=snapshot.docs
        .filter(item=>item.data().active!==false)
        .map(item=>({id:item.id,...item.data()}))
        .sort((a,b)=>String(a.displayName||"").localeCompare(String(b.displayName||"")));
      render();
    },
    error=>{
      console.error("Team read failed:",error);
      document.getElementById("member-logs").innerHTML='<div class="notice notice-danger">Team members could not be loaded: '+esc(error.message)+'</div>';
    }
  );
}
