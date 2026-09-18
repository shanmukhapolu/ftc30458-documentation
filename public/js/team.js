import { db } from "./firebase.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const list = document.getElementById("team-grid");
const count = document.getElementById("team-count");
const loading = document.getElementById("team-loading");

function esc(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function initials(name) {
  const parts = String(name || "Team Member").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name || "MM").slice(0, 2).toUpperCase();
}

export function subscribeToTeam() {
  const usersQuery = query(collection(db, "users"), orderBy("displayName", "asc"));

  return onSnapshot(usersQuery, function(snapshot) {
    loading.classList.add("hidden");

    const members = snapshot.docs.map(function(item) {
      return { id: item.id, ...item.data() };
    }).filter(function(member) {
      return member.active !== false;
    });

    count.textContent = members.length + (members.length === 1 ? " member" : " members");

    if (!members.length) {
      list.innerHTML =
        '<div class="card-shell"><div class="empty-state"><div class="empty-icon">◎</div><h3>No team profiles yet</h3><p>Members will appear here after they sign in.</p></div></div>';
      return;
    }

    list.innerHTML = members.map(function(member) {
      return '<article class="member-card">' +
        '<div class="member-card-top"><div class="avatar">' + esc(initials(member.displayName)) + '</div>' +
        '<div><div class="member-name">' + esc(member.displayName) + '</div>' +
        '<div class="member-role">' + esc(member.role || "Team Member") + '</div></div></div>' +
        '<div class="member-meta"><span class="chip chip-primary">' + esc(member.department || "Not assigned") + '</span></div>' +
        '<div class="member-email">' + esc(member.email) + '</div>' +
      '</article>';
    }).join("");
  }, function(error) {
    console.error(error);
    loading.textContent = "Unable to load team members.";
  });
}
