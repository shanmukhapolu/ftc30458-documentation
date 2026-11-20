import { initializeThemeToggle } from "./theme.js?v=20261119-02";
const icons={
home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></svg>',
practices:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 5H5v14h5"/><path d="m14 8 4 4-4 4"/><path d="M18 12H9"/></svg>'
};
function esc(value){return String(value||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function initials(name){const parts=String(name||"Team Member").trim().split(/\s+/).filter(Boolean);return parts.length>=2?(parts[0][0]+parts[parts.length-1][0]).toUpperCase():String(name||"MM").slice(0,2).toUpperCase();}
function navItem(id,label,href,icon,active){return '<li><a class="nav-link '+(id===active?"active":"")+'" href="./'+href+'"><span class="nav-icon">'+icon+'</span><span>'+label+'</span></a></li>';}
export function renderShell(options){
 const root=document.getElementById("app-shell");if(!root)return;
 const user=options.user||{},name=user.displayName||(user.email?user.email.split("@")[0]:"Team Member"),email=user.email||"",active=options.active||"dashboard",title=options.title||"Dashboard";
 root.innerHTML='<aside class="sidebar"><div class="sidebar-brand"><div class="brand-row"><div class="brand-mark">MM</div><div class="brand-text"><strong>MasterMinds</strong></div></div></div>'+
 '<nav class="sidebar-nav"><div class="nav-section"><div class="nav-label">Workspace</div><ul class="nav-list">'+navItem("dashboard","Dashboard","dashboard.html",icons.home,active)+navItem("practices","Practices","practices.html",icons.practices,active)+'</ul></div></nav>'+
 '<div class="sidebar-footer"><div class="user-card"><div class="avatar">'+esc(initials(name))+'</div><div class="user-info"><strong>'+esc(name)+'</strong><span>'+esc(email)+'</span></div><button id="logout-button" class="logout-button" type="button" title="Sign out" aria-label="Sign out">'+icons.logout+'</button></div></div></aside>'+
 '<main class="main"><header class="topbar"><div class="page-context"><h1>'+esc(title)+'</h1></div><div class="topbar-actions"><button id="theme-toggle" class="btn btn-outline btn-sm" type="button">Light mode</button></div></header><div id="page-content" class="content"></div></main>';
 initializeThemeToggle();
}