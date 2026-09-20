import { db } from "./firebase.js?v=20260920-01";
import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js?v=20260920-01";

let currentUser = null;
let logs = [];
let practices = new Map();

const LEGACY_CATEGORY = "General";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateKey(key) {
  const parts = String(key || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "Unknown practice";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(parts[0], parts[1] - 1, parts[2]));
}

function todayKey() {
  const date = new Date();
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function getPracticeId(log) {
  return log.practiceId || log.id || "";
}

function getTasks(log) {
  if (Array.isArray(log.tasks)) {
    return log.tasks
      .map(function(task) {
        return {
          text: String(task?.text || "").trim(),
          category: String(task?.category || LEGACY_CATEGORY).trim() || LEGACY_CATEGORY
        };
      })
      .filter(function(task) { return task.text; });
  }

  if (Array.isArray(log.selectedPresets) && log.selectedPresets.length) {
    return log.selectedPresets.map(function(text, index) {
      const areas = Array.isArray(log.workAreas) ? log.workAreas : [];
      return {
        text: String(text || "").trim(),
        category: areas[index] || areas[0] || LEGACY_CATEGORY
      };
    }).filter(function(task) { return task.text; });
  }

  if (log.majorAccomplishment) {
    return [{
      text: String(log.majorAccomplishment).trim(),
      category: Array.isArray(log.workAreas) && log.workAreas[0]
        ? log.workAreas[0]
        : LEGACY_CATEGORY
    }];
  }

  return [];
}

function getNextSteps(log) {
  if (Array.isArray(log.nextSteps)) {
    return log.nextSteps
      .map(function(step) {
        return {
          text: String(step?.text || "").trim(),
          category: String(step?.category || LEGACY_CATEGORY).trim() || LEGACY_CATEGORY
        };
      })
      .filter(function(step) { return step.text; });
  }

  if (log.nextStep) {
    return [{
      text: String(log.nextStep).trim(),
      category: Array.isArray(log.workAreas) && log.workAreas[0]
        ? log.workAreas[0]
        : LEGACY_CATEGORY
    }];
  }

  return [];
}

function getLearned(log) {
  return String(log.learned || log.lesson || "").trim();
}

function categoryList(log) {
  const set = new Set();
  getTasks(log).forEach(function(task) { set.add(task.category); });
  getNextSteps(log).forEach(function(step) { set.add(step.category); });
  return Array.from(set);
}

function updatedTime(log) {
  if (log.updatedAt?.toMillis) return log.updatedAt.toMillis();
  if (log.createdAt?.toMillis) return log.createdAt.toMillis();
  return 0;
}

function render() {
  const list = document.getElementById("my-log-list");
  const searchInput = document.getElementById("log-search");
  if (!list || !searchInput) return;

  const search = searchInput.value.trim().toLowerCase();

  const decorated = logs
    .map(function(log) {
      const practiceId = getPracticeId(log);
      const practice = practices.get(practiceId) || {};
      const dateKey = practice.dateKey || practiceId;
      return {
        ...log,
        practiceId,
        practice,
        dateKey,
        tasks: getTasks(log),
        nextSteps: getNextSteps(log),
        learned: getLearned(log),
        categories: categoryList(log)
      };
    })
    .filter(function(log) {
      if (!search) return true;
      const haystack = [
        formatDateKey(log.dateKey),
        log.tasks.map(function(task) { return task.text; }).join(" "),
        log.categories.join(" "),
        log.learned,
        log.nextSteps.map(function(step) { return step.text; }).join(" ")
      ].join(" ").toLowerCase();
      return haystack.includes(search);
    })
    .sort(function(a, b) {
      return String(b.dateKey || b.practiceId).localeCompare(String(a.dateKey || a.practiceId));
    });

  const allLogs = logs.map(function(log) {
    return {
      tasks: getTasks(log),
      nextSteps: getNextSteps(log),
      dateKey: practices.get(getPracticeId(log))?.dateKey || getPracticeId(log)
    };
  });

  const totalTasks = allLogs.reduce(function(sum, log) { return sum + log.tasks.length; }, 0);
  const totalNext = allLogs.reduce(function(sum, log) { return sum + log.nextSteps.length; }, 0);
  const today = todayKey();
  const hasToday = allLogs.some(function(log) { return log.dateKey === today; });

  document.getElementById("stat-logs").textContent = logs.length;
  document.getElementById("stat-tasks").textContent = totalTasks;
  document.getElementById("stat-next").textContent = totalNext;
  document.getElementById("stat-today").textContent = hasToday ? "Logged" : "Missing";
  document.getElementById("stat-today-meta").textContent = hasToday
    ? "Today is documented"
    : "Start today's documentation";

  if (!decorated.length) {
    list.innerHTML =
      '<div class="card-shell personal-empty">' +
        '<div class="empty-state">' +
          '<div class="empty-icon">▣</div>' +
          '<h3>No logs found</h3>' +
          '<p>' + (logs.length ? "Try a different search." : "Your practice logs will appear here after you save one.") + '</p>' +
        '</div>' +
      '</div>';
    return;
  }

  list.innerHTML = decorated.map(function(log) {
    const preview = log.tasks.slice(0, 3);
    const extra = Math.max(0, log.tasks.length - preview.length);
    const categories = log.categories.slice(0, 5);

    return '<article class="personal-log-card" tabindex="0" data-log-id="' + esc(log.practiceId) + '">' +
      '<div class="personal-log-card-main">' +
        '<div class="personal-log-card-header">' +
          '<div>' +
            '<div class="eyebrow">Practice</div>' +
            '<h3>' + esc(formatDateKey(log.dateKey)) + '</h3>' +
          '</div>' +
          '<span class="chip chip-success">' + log.tasks.length + ' task' + (log.tasks.length === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div class="chip-row">' + categories.map(function(category) {
          return '<span class="chip chip-primary">' + esc(category) + '</span>';
        }).join("") + '</div>' +
        '<ul class="compact-bullet-list">' +
          preview.map(function(task) {
            return '<li><span class="category-dot">' + esc(task.category) + '</span>' + esc(task.text) + '</li>';
          }).join("") +
          (extra ? '<li class="muted-bullet">+' + extra + ' more task' + (extra === 1 ? '' : 's') + '</li>' : '') +
        '</ul>' +
      '</div>' +
      '<div class="personal-log-card-side">' +
        '<div><span class="log-side-label">Learned</span><span class="log-side-value">' + (log.learned ? 'Added' : 'Missing') + '</span></div>' +
        '<div><span class="log-side-label">Next steps</span><span class="log-side-value">' + log.nextSteps.length + '</span></div>' +
        '<div><span class="log-side-label">Updated</span><span class="log-side-value">' + (updatedTime(log) ? new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric" }).format(new Date(updatedTime(log))) : "—") + '</span></div>' +
        '<a class="btn btn-outline btn-sm" href="./practice.html?id=' + encodeURIComponent(log.practiceId) + '" data-practice-link>View practice</a>' +
      '</div>' +
    '</article>';
  }).join("");

  list.querySelectorAll("[data-log-id]").forEach(function(card) {
    card.addEventListener("click", function(event) {
      if (event.target.closest("[data-practice-link]")) return;
      window.location.href = "./log-entry.html?practiceId=" + encodeURIComponent(card.dataset.logId);
    });
    card.addEventListener("keydown", function(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = "./log-entry.html?practiceId=" + encodeURIComponent(card.dataset.logId);
      }
    });
  });
}

async function createToday() {
  const key = todayKey();
  const button = document.getElementById("create-today");
  button.disabled = true;
  button.textContent = "Opening…";

  try {
    await setDoc(doc(db, "practices", key), {
      title: formatDateKey(key),
      dateKey: key,
      createdBy: currentUser.uid,
      createdByEmail: currentUser.email || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    window.location.href = "./log-entry.html?practiceId=" + encodeURIComponent(key);
  } catch (error) {
    console.error("Failed to create practice:", error);
    showToast("Could not open today's practice: " + error.message, "error", 7000);
    button.disabled = false;
    button.textContent = "Log Today's Practice";
  }
}

export function initializeMyLogs(user) {
  currentUser = user;

  const queryPracticeId = new URLSearchParams(window.location.search).get("practiceId");
  if (queryPracticeId) {
    window.location.replace("./log-entry.html?practiceId=" + encodeURIComponent(queryPracticeId));
    return;
  }

  const searchInput = document.getElementById("log-search");
  const createButton = document.getElementById("create-today");
  if (!searchInput || !createButton) {
    console.error("My Logs page could not initialize: required DOM elements are missing.");
    return;
  }

  searchInput.addEventListener("input", render);
  createButton.addEventListener("click", createToday);

  onSnapshot(
    collection(db, "practices"),
    snapshot => {
      practices = new Map(
        snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }])
      );
      render();
    },
    error => {
      console.error("Practices failed:", error);
      showToast("Practice dates could not be loaded: " + error.message, "error", 7000);
    }
  );

  onSnapshot(
    collectionGroup(db, "logs"),
    snapshot => {
      logs = snapshot.docs
        .map(item => ({
          id: item.id,
          practiceId: item.data().practiceId || item.ref.parent.parent?.id || "",
          ...item.data()
        }))
        .filter(function(log) {
          return log.userId === currentUser.uid || log.id === currentUser.uid;
        });
      render();
    },
    error => {
      console.error("My logs failed:", error);
      document.getElementById("my-log-list").innerHTML =
        '<div class="notice notice-danger">Your logs could not be loaded: ' + esc(error.message) + '</div>';
      showToast("Your logs could not be loaded: " + error.message, "error", 7000);
    }
  );
}
