const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></svg>',
  practices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-3.5 2.5-5 5.5-5s4.9 1.5 5.5 5M14 15.5c2.8-.2 5 .9 6 4.5"/></svg>',
  timeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4v16M6 8h8M6 14h10M18 14v6"/></svg>',
  portfolio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 5H5v14h5"/><path d="m14 8 4 4-4 4"/><path d="M18 12H9"/></svg>'
};

function esc(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function initials(name) {
  const parts = String(name || "Team Member").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name || "MM").slice(0, 2).toUpperCase();
}

function navItem(id, label, href, icon, active) {
  return '<li><a class="nav-link ' + (id === active ? "active" : "") + '" href="./' + href + '">' +
    '<span class="nav-icon">' + icon + '</span><span>' + label + '</span></a></li>';
}

function disabledItem(label, icon) {
  return '<li><span class="nav-link" style="opacity:.42;cursor:default"><span class="nav-icon">' + icon + '</span><span>' + label + '</span></span></li>';
}

export function renderShell(options) {
  const root = document.getElementById("app-shell");
  if (!root) return;

  const user = options.user || {};
  const name = user.displayName || (user.email ? user.email.split("@")[0] : "Team Member");
  const email = user.email || "";
  const active = options.active || "dashboard";
  const title = options.title || "Dashboard";

  root.innerHTML =
    '<aside class="sidebar">' +
      '<div class="sidebar-brand">' +
        '<div class="brand-row">' +
          '<div class="brand-mark">MM</div>' +
          '<div class="brand-text"><strong>MasterMinds</strong><span>FTC 30458</span></div>' +
        '</div>' +
        '<div class="sidebar-kicker">Team engineering documentation</div>' +
      '</div>' +
      '<nav class="sidebar-nav">' +
        '<div class="nav-section">' +
          '<div class="nav-label">Workspace</div>' +
          '<ul class="nav-list">' +
            navItem("dashboard", "Dashboard", "dashboard.html", icons.home, active) +
            navItem("practices", "Practices", "practices.html", icons.practices, active) +
            navItem("my-log", "My Logs", "my-log.html", icons.log, active) +
          '</ul>' +
        '</div>' +
        '<div class="nav-section">' +
          '<div class="nav-label">Team</div>' +
          '<ul class="nav-list">' +
            navItem("team", "Team", "team.html", icons.team, active) +
          '</ul>' +
        '</div>' +
        '<div class="nav-section">' +
          '<div class="nav-label">Coming next</div>' +
          '<ul class="nav-list">' +
            disabledItem("Timeline", icons.timeline) +
            disabledItem("Portfolio", icons.portfolio) +
          '</ul>' +
        '</div>' +
      '</nav>' +
      '<div class="sidebar-footer">' +
        '<div class="user-card">' +
          '<div class="avatar">' + esc(initials(name)) + '</div>' +
          '<div class="user-info"><strong>' + esc(name) + '</strong><span>' + esc(email) + '</span></div>' +
          '<button id="logout-button" class="logout-button" type="button" title="Sign out" aria-label="Sign out">' + icons.logout + '</button>' +
        '</div>' +
      '</div>' +
    '</aside>' +
    '<main class="main">' +
      '<header class="topbar"><div class="page-context"><p>Engineering Log</p><h1>' + esc(title) + '</h1></div><div class="topbar-actions"></div></header>' +
      '<div id="page-content" class="content"></div>' +
    '</main>';
}
