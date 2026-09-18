import { db } from "./firebase.js";
import { doc, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let currentUser = null;
let practice = null;
let logs = [];
let users = [];
let modalLog = null;

const modal = document.getElementById("log-modal");
const modalBody = document.getElementById("modal-body");
const modalTitle = document.getElementById("modal-title");
const modalFooter = document.getElementById("modal-footer");

function esc(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function initials(name) {
  const parts = String(name || "Team Member").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name || "MM").slice(0,2).toUpperCase();
}

function formatDateKey(key) {
  const parts = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {month:"long",day:"numeric",year:"numeric"}).format(new Date(parts[0], parts[1]-1, parts[2]));
}

function openModal(log) {
  modalLog = log;
  modalTitle.textContent = log.memberName || "Team member";
  modal.classList.add("open");
  document.body.style.overflow = "hidden";

  const workAreas = Array.isArray(log.workAreas) ? log.workAreas : [];
  const presets = Array.isArray(log.selectedPresets) ? log.selectedPresets : [];
  const details = log.details || {};

  let html = "";
  if (workAreas.length) {
    html += '<div class="log-view-block"><div class="log-view-label">Work areas</div><div class="log-view-tags">' +
      workAreas.map(function(item){ return '<span class="chip chip-primary">' + esc(item) + '</span>'; }).join("") +
      '</div></div>';
  }

  if (log.majorAccomplishment) {
    html += '<div class="log-view-block"><div class="log-view-label">Major accomplishment</div><div class="log-view-text">' + esc(log.majorAccomplishment) + '</div></div>';
  }

  if (presets.length) {
    html += '<div class="log-view-block"><div class="log-view-label">Quick phrases</div><div class="log-view-tags">' +
      presets.map(function(item){ return '<span class="chip chip-teal">' + esc(item) + '</span>'; }).join("") +
      '</div></div>';
  }

  Object.keys(details).forEach(function(key) {
    const item = details[key];
    if (!item || typeof item !== "object") return;

    Object.keys(item).forEach(function(field) {
      if (!item[field]) return;
      html += '<div class="log-view-block"><div class="log-view-label">' +
        esc(pretty(field)) + '</div><div class="log-view-text">' +
        esc(item[field]) + '</div></div>';
    });
  });

  if (log.lesson) {
    html += '<div class="log-view-block"><div class="log-view-label">Lesson learned</div><div class="log-view-text">' + esc(log.lesson) + '</div></div>';
  }

  if (log.nextStep) {
    html += '<div class="log-view-block"><div class="log-view-label">Next step</div><div class="log-view-text">' + esc(log.nextStep) + '</div></div>';
  }

  if (!html) {
    html = '<div class="empty-state"><p>No documentation has been added yet.</p></div>';
  }

  modalBody.innerHTML = html;

  if (log.id === currentUser.uid) {
    modalFooter.innerHTML =
      '<button id="modal-edit" class="btn btn-primary" type="button">Edit My Log</button>';
    document.getElementById("modal-edit").addEventListener("click", function() {
      window.location.href = "./my-log.html?practiceId=" + encodeURIComponent(practice.id);
    });
  } else {
    modalFooter.innerHTML =
      '<span class="chip chip-neutral">Read only · only the author can edit this log</span>';
  }
}

function pretty(field) {
  return field.replace(/([A-Z])/g, " $1").replace(/^./, function(char){return char.toUpperCase();});
}

function closeModal() {
  modal.classList.remove("open");
  document.body.style.overflow = "";
  modalLog = null;
}

function render() {
  if (!practice) return;

  const dateKey = practice.dateKey || practice.id;
  document.getElementById("practice-title").textContent = formatDateKey(dateKey);
  document.getElementById("practice-meta").textContent =
    "Shared practice record · " + logs.length + " of " + users.length + " members documented.";

  const loggedCount = logs.length;
  const areaSet = new Set();
  logs.forEach(function(log) {
    (log.workAreas || []).forEach(function(area){ areaSet.add(area); });
  });

  document.getElementById("member-progress").textContent =
    users.length ? loggedCount + "/" + users.length : String(loggedCount);
  document.getElementById("work-area-count").textContent = areaSet.size;
  document.getElementById("accomplishment-count").textContent =
    logs.filter(function(log){ return Boolean(log.majorAccomplishment); }).length;

  let latest = null;
  logs.forEach(function(log) {
    if (!latest) {
      latest = log;
      return;
    }
    const a = latest.updatedAt && latest.updatedAt.toMillis ? latest.updatedAt.toMillis() : 0;
    const b = log.updatedAt && log.updatedAt.toMillis ? log.updatedAt.toMillis() : 0;
    if (b > a) latest = log;
  });

  document.getElementById("last-update").textContent = latest ? "Updated" : "—";

  const accomplishments = document.getElementById("accomplishments");
  const rows = logs.filter(function(log){ return log.majorAccomplishment; });

  if (!rows.length) {
    accomplishments.innerHTML = '<div class="empty-state"><p>Member accomplishments will appear here as everyone logs their work.</p></div>';
  } else {
    accomplishments.innerHTML = rows.map(function(log) {
      return '<div class="accomplishment-row"><strong>' + esc(log.memberName || "Team member") +
        '</strong><span>— ' + esc(log.majorAccomplishment) + '</span></div>';
    }).join("");
  }

  const memberLogs = document.getElementById("member-logs");

  if (!users.length) {
    memberLogs.innerHTML = '<div class="card-shell"><div class="empty-state"><p>No team members are registered yet.</p></div></div>';
    return;
  }

  memberLogs.innerHTML = users.map(function(user) {
    const log = logs.find(function(item){ return item.id === user.id; });
    const mine = user.id === currentUser.uid;

    return '<article class="member-card" data-log-user="' + esc(user.id) + '" style="cursor:pointer">' +
      '<div class="member-card-top"><div class="avatar">' + esc(initials(user.displayName)) + '</div>' +
      '<div><div class="member-name">' + esc(user.displayName || "Team Member") + '</div>' +
      '<div class="member-role">' + esc(user.department || user.role || "Team member") + '</div></div></div>' +
      '<div class="member-meta">' +
        (log ? '<span class="chip chip-success">Documented</span>' : '<span class="chip chip-warning">Not yet logged</span>') +
        (mine ? '<span class="chip chip-primary">You</span>' : '') +
      '</div>' +
      '<div class="member-email">' +
        (log && log.majorAccomplishment ? esc(log.majorAccomplishment) : (mine ? "Click to write your log." : "No documentation yet.")) +
      '</div>' +
    '</article>';
  }).join("");

  memberLogs.querySelectorAll("[data-log-user]").forEach(function(card) {
    card.addEventListener("click", function() {
      const uid = card.dataset.logUser;
      const log = logs.find(function(item){ return item.id === uid; });

      if (uid === currentUser.uid && log) {
        openModal(log);
      } else if (uid === currentUser.uid) {
        window.location.href = "./my-log.html?practiceId=" + encodeURIComponent(practice.id);
      } else if (log) {
        openModal(log);
      }
    });
  });
}

export function initializePracticePage(user) {
  currentUser = user;
  const params = new URLSearchParams(window.location.search);
  const practiceId = params.get("id");

  if (!practiceId) {
    document.getElementById("practice-title").textContent = "Practice not found";
    return;
  }

  document.getElementById("edit-my-log").addEventListener("click", function() {
    window.location.href = "./my-log.html?practiceId=" + encodeURIComponent(practiceId);
  });

  document.getElementById("close-modal").addEventListener("click", closeModal);
  modal.addEventListener("click", function(event) {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") closeModal();
  });

  onSnapshot(doc(db, "practices", practiceId), function(snapshot) {
    if (!snapshot.exists()) {
      document.getElementById("practice-title").textContent = "Practice not found";
      return;
    }
    practice = { id: snapshot.id, ...snapshot.data() };
    render();
  });

  onSnapshot(collection(db, "practices", practiceId, "logs"), function(snapshot) {
    logs = snapshot.docs.map(function(item){ return { id: item.id, ...item.data() }; });
    render();
  });

  onSnapshot(query(collection(db, "users"), orderBy("displayName", "asc")), function(snapshot) {
    users = snapshot.docs.filter(function(item){ return item.data().active !== false; }).map(function(item){
      return { id: item.id, ...item.data() };
    });
    render();
  });
}
