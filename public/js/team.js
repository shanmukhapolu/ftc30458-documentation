import { db } from "./firebase.js?v=20260918-02";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
  return p.length>=2
    ? (p[0][0]+p[p.length-1][0]).toUpperCase()
    : String(name||"MM").slice(0,2).toUpperCase();
}

export function subscribeToTeam(){
  const list=document.getElementById("team-grid");
  const count=document.getElementById("team-count");
  const loading=document.getElementById("team-loading");

  if(!list || !count || !loading){
    console.error("Team page could not initialize: required DOM elements are missing.");
    return ()=>{};
  }

  return onSnapshot(
    collection(db,"users"),
    snapshot=>{
      loading.classList.add("hidden");

      const members=snapshot.docs
        .map(item=>({id:item.id,...item.data()}))
        .filter(member=>member.active!==false)
        .sort((a,b)=>String(a.displayName||"").localeCompare(String(b.displayName||"")));

      count.textContent=members.length+" "+(members.length===1?"member":"members");

      list.innerHTML=members.length
        ? members.map(member=>'<article class="member-card"><div class="member-card-top"><div class="avatar">'+esc(initials(member.displayName))+'</div><div><div class="member-name">'+esc(member.displayName||"Team Member")+'</div><div class="member-role">'+esc(member.role||"Team Member")+'</div></div></div><div class="member-meta"><span class="chip chip-primary">'+esc(member.role||"Team Member")+'</span></div><div class="member-email">'+esc(member.email||"")+'</div></article>').join("")
        : '<div class="card-shell"><div class="empty-state"><div class="empty-icon">◎</div><h3>No team profiles yet</h3><p>Members will appear here after they complete setup.</p></div></div>';
    },
    error=>{
      console.error("Team listener failed:",error);
      loading.classList.remove("hidden");
      loading.textContent="Team members could not be loaded: "+error.message;
      count.textContent="Unable to load";
      list.innerHTML='<div class="notice notice-danger">Team members could not be loaded: '+esc(error.message)+'</div>';
    }
  );
}
