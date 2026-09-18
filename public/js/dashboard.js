import { db } from "./firebase.js";
import { collection, doc, onSnapshot, query, orderBy, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let currentUser = null;
let practices = [];
let users = [];
const logsByPractice = new Map();
const unsubscribers = new Map();

function localDateKey(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function formatDateKey(key) {
  const parts = key.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function dayDifference(laterKey, earlierKey) {
  const later = new Date(laterKey + "T00:00:00");
  const earlier = new Date(earlierKey + "T00:00:00");
  return Math.round((later - earlier) / 86400000);
}

function esc(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function getTodayPractice() {
  const today = localDateKey();
  return practices.find(function(practice) {
    return practice.id === today || practice.dateKey === today;
  }) || null;
}

function missingPastPractices() {
  const today = localDateKey();

  return practices.filter(function(practice) {
    const key = practice.dateKey || practice.id;
    if (!key || key >= today) return false;
    const logs = logsByPractice.get(practice.id) || [];
    return !logs.some(function(log) {
      return log.id === currentUser.uid;
    });
  });
}

async function createPracticeForToday() {
  const today = localDateKey();
  const reference = doc(db, "practices", today);

  await setDoc(reference, {
    title: formatDateKey(today),
    dateKey: today,
    createdBy: currentUser.uid,
    createdByEmail: currentUser.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  window.location.href = "./practice.html?id=" + encodeURIComponent(today);
}

function subscribeToPracticeLogs(practiceId) {
  if (unsubscribers.has(practiceId)) return;

  const logsReference = collection(db, "practices", practiceId, "logs");

  const unsubscribe = onSnapshot(logsReference, function(snapshot) {
    logsByPractice.set(practiceId, snapshot.docs.map(function(item) {
      return { id: item.id, ...item.data() };
    }));
    render();
  });

  unsubscribers.set(practiceId, unsubscribe);
}

function updatePracticeSubscriptions() {
  const activeIds = new Set(practices.map(function(practice) {
    return practice.id;
  }));

  practices.forEach(function(practice) {
    subscribeToPracticeLogs(practice.id);
  });

  Array.from(unsubscribers.keys()).forEach(function(id) {
    if (!activeIds.has(id)) {
      unsubscribers.get(id)();
      unsubscribers.delete(id);
      logsByPractice.delete(id);
    }
  });
}

function render() {
  const today = localDateKey();
  const todayPractice = getTodayPractice();
  const missing = missingPastPractices();

  document.getElementById("stat-practices").textContent = practices.length;
  document.getElementById("stat-my-logs").textContent = practices.filter(function(practice) {
    return (logsByPractice.get(practice.id) || []).some(function(log) {
      return log.id === currentUser.uid;
    });
  }).length;

  document.getElementById("stat-today").textContent = todayPractice ? "Yes" : "—";
  document.getElementById("stat-overdue").textContent = missing.length;

  const todayStatus = document.getElementById("today-status");
  const todayNote = document.getElementById("today-status-note");
  const createButton = document.getElementById("create-today");

  if (!todayPractice) {
    todayStatus.textContent = "Not started";
    todayNote.textContent = "Create today's shared practice.";
    createButton.classList.remove("hidden");
  } else {
    const todayLogs = logsByPractice.get(todayPractice.id) || [];
    const mine = todayLogs.some(function(log) {
      return log.id === currentUser.uid;
    });
    todayStatus.textContent = mine ? "Logged" : "Due today";
    todayNote.textContent = mine ? "Your documentation is saved." : "Your practice log is still missing.";
    createButton.classList.add("hidden");
  }

  const totalMembers = users.length;
  const loggedToday = todayPractice ? (logsByPractice.get(todayPractice.id) || []).length : 0;
  document.getElementById("team-completion").textContent =
    totalMembers ? Math.min(loggedToday, totalMembers) + "/" + totalMembers : "—";

  const latest = practices[0];
  document.getElementById("latest-practice").textContent =
    latest ? formatDateKey(latest.dateKey || latest.id) : "—";
  document.getElementById("latest-practice-note").textContent =
    latest ? ((logsByPractice.get(latest.id) || []).length + " member logs") : "No practice yet";

  const overdueList = document.getElementById("overdue-list");
  if (!missing.length) {
    overdueList.innerHTML =
      '<div class="notice notice-success">You are caught up. No past practice logs are missing.</div>';
  } else {
    overdueList.innerHTML = missing.slice(0, 8).map(function(practice) {
      const key = practice.dateKey || practice.id;
      const days = dayDifference(today, key);
      return '<div class="overdue-item">' +
        '<div><strong>' + esc(formatDateKey(key)) + '</strong><span>' +
        (days === 1 ? "1 day overdue" : days + " days overdue") +
        '</span></div>' +
        '<a class="btn btn-outline btn-sm" href="./my-log.html?practiceId=' + encodeURIComponent(practice.id) + '">Log it</a>' +
      '</div>';
    }).join("");
  }

  const recent = document.getElementById("recent-practices");
  if (!practices.length) {
    recent.innerHTML =
      '<div class="empty-state"><div class="empty-icon">▣</div><h3>No practices yet</h3><p>Create the first practice to start the engineering record.</p></div>';
  } else {
    recent.innerHTML = practices.slice(0, 8).map(function(practice) {
      const logs = logsByPractice.get(practice.id) || [];
      const key = practice.dateKey || practice.id;
      return '<article class="practice-row" data-id="' + esc(practice.id) + '">' +
        '<div class="practice-number">DAY<div class="practice-date">' + esc(formatDateKey(key)) + '</div></div>' +
        '<div class="practice-main"><h3 class="practice-title">' + esc(formatDateKey(key)) + '</h3>' +
        '<p class="practice-description">' + logs.length + ' member ' + (logs.length === 1 ? "log" : "logs") + ' documented so far.</p>' +
        '<div class="practice-meta"><span>Shared practice</span><span>•</span><span>Live synced</span></div></div>' +
        '<div class="practice-side"><span class="chip ' + (logs.some(function(log){return log.id === currentUser.uid;}) ? "chip-success" : "chip-warning") + '">' +
        (logs.some(function(log){return log.id === currentUser.uid;}) ? "Logged" : "Needs your log") + '</span></div>' +
      '</article>';
    }).join("");

    recent.querySelectorAll("[data-id]").forEach(function(row) {
      row.addEventListener("click", function() {
        window.location.href = "./practice.html?id=" + encodeURIComponent(row.dataset.id);
      });
    });
  }

  const activity = [];
  practices.slice(0, 5).forEach(function(practice) {
    (logsByPractice.get(practice.id) || []).forEach(function(log) {
      activity.push({
        practice: practice,
        log: log
      });
    });
  });

  activity.sort(function(a,b) {
    const aTime = a.log.updatedAt && a.log.updatedAt.toMillis ? a.log.updatedAt.toMillis() : 0;
    const bTime = b.log.updatedAt && b.log.updatedAt.toMillis ? b.log.updatedAt.toMillis() : 0;
    return bTime - aTime;
  });

  const activityElement = document.getElementById("recent-activity");
  if (!activity.length) {
    activityElement.innerHTML =
      '<div class="empty-state"><p>No member documentation yet.</p></div>';
  } else {
    activityElement.innerHTML = activity.slice(0, 8).map(function(item) {
      const name = item.log.memberName || item.log.memberEmail || "Team Member";
      const accomplishment = item.log.majorAccomplishment || "Updated a practice log.";
      return '<div class="activity-row"><div class="activity-dot"></div><div class="activity-copy"><strong>' +
        esc(name) + " — " + esc(accomplishment) + '</strong><span>' +
        esc(formatDateKey(item.practice.dateKey || item.practice.id)) + '</span></div></div>';
    }).join("");
  }
}

export function initializeDashboard(user) {
  currentUser = user;

  document.getElementById("welcome").textContent =
    "Welcome back, " + ((user.displayName || user.email || "team member").split(" ")[0]) + ".";

  document.getElementById("create-today").addEventListener("click", createPracticeForToday);

  const practicesQuery = query(
    collection(db, "practices"),
    orderBy("dateKey", "desc")
  );

  onSnapshot(practicesQuery, function(snapshot) {
    practices = snapshot.docs.map(function(item) {
      return { id: item.id, ...item.data() };
    });

    updatePracticeSubscriptions();
    render();
  });

  onSnapshot(query(collection(db, "users"), orderBy("displayName", "asc")), function(snapshot) {
    users = snapshot.docs.filter(function(item) {
      return item.data().active !== false;
    });
    render();
  });
}
