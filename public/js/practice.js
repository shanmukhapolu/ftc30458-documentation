import { db } from "./firebase.js?v=20260920-02";
import { deletePracticeCompletely } from "./practice-delete.js?v=20260920-02";
import {
  collection,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let currentUser = null;
let practice = null;
let logs = [];
let users = [];
let deleting = false;

const LEGACY_CATEGORY = "General";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name) {
  const parts = String(name || "Team Member").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name || "MM").slice(0, 2).toUpperCase();
}

function formatDateKey(key) {
  const parts = String(key || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "Practice";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(parts[0], parts[1] - 1, parts[2]));
}

function getTasks(log) {
  if (Array.isArray(log.tasks)) {
    return log.tasks.map(function(task) {
      return {
        text: String(task?.text || "").trim(),
        category: String(task?.category || LEGACY_CATEGORY).trim() || LEGACY_CATEGORY
      };
    }).filter(function(task) { return task.text; });
  }

  if (Array.isArray(log.selectedPresets) && log.selectedPresets.length) {
    const areas = Array.isArray(log.workAreas) ? log.workAreas : [];
    return log.selectedPresets.map(function(text, index) {
      return {
        text: String(text || "").trim(),
        category: areas[index] || areas[0] || LEGACY_CATEGORY
      };
    }).filter(function(task) { return task.text; });
  }

  if (log.majorAccomplishment) {
    return [{
      text: String(log.majorAccomplishment).trim(),
      category: Array.isArray(log.workAreas) && log.workAreas[0] ? log.workAreas[0] : LEGACY_CATEGORY
    }];
  }

  return [];
}

function getNextSteps(log) {
  if (Array.isArray(log.nextSteps)) {
    return log.nextSteps.map(function(step) {
      return {
        text: String(step?.text || "").trim(),
        category: String(step?.category || LEGACY_CATEGORY).trim() || LEGACY_CATEGORY
      };
    }).filter(function(step) { return step.text; });
  }

  if (log.nextStep) {
    return [{
      text: String(log.nextStep).trim(),
      category: Array.isArray(log.workAreas) && log.workAreas[0] ? log.workAreas[0] : LEGACY_CATEGORY
    }];
  }

  return [];
}

function getLearned(log) {
  return String(log.learned || log.lesson || "").trim();
}

function updatedTime(log) {
  if (log.updatedAt?.toMillis) return log.updatedAt.toMillis();
  if (log.createdAt?.toMillis) return log.createdAt.toMillis();
  return 0;
}

function groupByCategory(items) {
  const grouped = new Map();
  items.forEach(function(item) {
    const category = item.category || LEGACY_CATEGORY;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  });
  return grouped;
}

function renderCategoryBoard(items, emptyMessage) {
  if (!items.length) {
    return '<div class="empty-state"><p>' + esc(emptyMessage) + '</p></div>';
  }

  const grouped = groupByCategory(items);

  return Array.from(grouped.entries()).map(function(entry) {
    const category = entry[0];
    const categoryItems = entry[1];

    return '<section class="category-group">' +
      '<div class="category-group-head"><h3>' + esc(category) + '</h3><span class="chip chip-primary">' + categoryItems.length + '</span></div>' +
      '<ul class="practice-task-list">' +
        categoryItems.map(function(item) {
          return '<li><span class="practice-task-bullet">•</span><span class="practice-task-text">' + esc(item.text) + '</span><span class="practice-task-author">' + esc(item.memberName || "Team member") + '</span></li>';
        }).join("") +
      '</ul>' +
    '</section>';
  }).join("");
}

function renderMemberModal(log) {
  const tasks = getTasks(log);
  const nextSteps = getNextSteps(log);
  const taskBoard = renderCategoryBoard(
    tasks.map(function(task) { return { ...task, memberName: "" }; }),
    "No completed tasks."
  );
  const nextBoard = renderCategoryBoard(
    nextSteps.map(function(step) { return { ...step, memberName: "" }; }),
    "No next steps."
  );

  let html =
    '<div class="log-modal-member-meta">' +
      '<span class="chip chip-primary">' + esc(log.memberName || "Team member") + '</span>' +
      (log.memberEmail ? '<span class="chip chip-neutral">' + esc(log.memberEmail) + '</span>' : '') +
    '</div>' +
    '<div class="log-view-block"><div class="log-view-label">Tasks completed</div><div class="modal-category-board">' + taskBoard + '</div></div>';

  if (getLearned(log)) {
    html += '<div class="log-view-block"><div class="log-view-label">What they learned</div><div class="log-view-text">' + esc(getLearned(log)) + '</div></div>';
  }

  html += '<div class="log-view-block"><div class="log-view-label">Next steps</div><div class="modal-category-board">' + nextBoard + '</div></div>';

  return html;
}

function openModal(log) {
  const modal = document.getElementById("log-modal");
  const body = document.getElementById("modal-body");
  const title = document.getElementById("modal-title");
  const footer = document.getElementById("modal-footer");
  if (!modal || !body || !title || !footer) return;

  title.textContent = log.memberName || "Team member";
  body.innerHTML = renderMemberModal(log);
  footer.innerHTML = log.id === currentUser.uid
    ? '<button id="modal-edit" class="btn btn-primary" type="button">Edit My Log</button>'
    : '<span class="chip chip-neutral">Read only · only the author can edit this log</span>';

  document.getElementById("modal-edit")?.addEventListener("click", function() {
    window.location.href = "./log-entry.html?practiceId=" + encodeURIComponent(practice.id);
  });

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = document.getElementById("log-modal");
  if (!modal) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

function render() {
  if (!practice) return;

  const key = practice.dateKey || practice.id;
  const tasks = logs.flatMap(function(log) {
    return getTasks(log).map(function(task) {
      return { ...task, memberName: log.memberName || "Team member" };
    });
  });
  const nextSteps = logs.flatMap(function(log) {
    return getNextSteps(log).map(function(step) {
      return { ...step, memberName: log.memberName || "Team member" };
    });
  });
  const categories = new Set();
  tasks.forEach(function(task) { categories.add(task.category); });
  nextSteps.forEach(function(step) { categories.add(step.category); });

  document.getElementById("practice-title").textContent = formatDateKey(key);
  document.getElementById("practice-meta").textContent =
    "Shared practice record · " + logs.length + " of " + users.length + " members documented.";

  document.getElementById("member-progress").textContent =
    users.length ? logs.length + "/" + users.length : String(logs.length);
  document.getElementById("task-count").textContent = tasks.length;
  document.getElementById("category-count").textContent = categories.size;
  document.getElementById("next-step-count").textContent = nextSteps.length;

  document.getElementById("team-tasks").innerHTML =
    renderCategoryBoard(tasks, "Completed tasks will appear here as team members document the practice.");

  document.getElementById("team-next-steps").innerHTML =
    renderCategoryBoard(nextSteps, "Next steps will appear here as team members document what they plan to do next.");

  const reflectionLogs = logs.filter(function(log) { return getLearned(log); });
  document.getElementById("team-reflections").innerHTML = reflectionLogs.length
    ? reflectionLogs.map(function(log) {
        return '<article class="reflection-card">' +
          '<div class="reflection-card-head"><strong>' + esc(log.memberName || "Team member") + '</strong><span class="chip chip-neutral">Reflection</span></div>' +
          '<p>' + esc(getLearned(log)) + '</p>' +
        '</article>';
      }).join("")
    : '<div class="card-shell"><div class="empty-state"><p>Member reflections will appear as logs are submitted.</p></div></div>';

  const latest = logs
    .map(updatedTime)
    .filter(Boolean)
    .sort(function(a, b) { return b - a; })[0];

  const lastUpdateText = latest
    ? new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }).format(new Date(latest))
    : "—";

  let lastUpdateMeta = document.querySelector("#next-step-count")?.parentElement;
  void lastUpdateMeta;
  
  const memberLogs = document.getElementById("member-logs");
  if (!users.length) {
    memberLogs.innerHTML = '<div class="card-shell"><div class="empty-state"><p>No team members are registered yet.</p></div></div>';
    return;
  }

  memberLogs.innerHTML = users.map(function(user) {
    const log = logs.find(function(item) { return item.id === user.id; });
    const mine = user.id === currentUser.uid;
    const taskList = log ? getTasks(log) : [];
    const nextList = log ? getNextSteps(log) : [];

    return '<article class="member-card" data-log-user="' + esc(user.id) + '" style="cursor:pointer">' +
      '<div class="member-card-top">' +
        '<div class="avatar">' + esc(initials(user.displayName)) + '</div>' +
        '<div><div class="member-name">' + esc(user.displayName || "Team Member") + '</div><div class="member-role">' + esc(user.role || "Team Member") + '</div></div>' +
      '</div>' +
      '<div class="member-meta">' +
        (log ? '<span class="chip chip-success">Documented</span>' : '<span class="chip chip-warning">Not yet logged</span>') +
        (mine ? '<span class="chip chip-primary">You</span>' : '') +
      '</div>' +
      '<div class="member-email">' +
        (log
          ? esc(taskList.slice(0, 2).map(function(task) { return task.text; }).join(" · ") || "Log saved.")
          : (mine ? "Click to write your practice log." : "No documentation yet.")) +
      '</div>' +
      '<div class="member-meta">' +
        (log ? '<span>' + taskList.length + ' task' + (taskList.length === 1 ? '' : 's') + '</span><span>•</span><span>' + nextList.length + ' next step' + (nextList.length === 1 ? '' : 's') + '</span>' : '') +
      '</div>' +
    '</article>';
  }).join("");

  memberLogs.querySelectorAll("[data-log-user]").forEach(function(card) {
    card.addEventListener("click", function() {
      const uid = card.dataset.logUser;
      const log = logs.find(function(item) { return item.id === uid; });
      if (uid === currentUser.uid && !log) {
        window.location.href = "./log-entry.html?practiceId=" + encodeURIComponent(practice.id);
      } else if (log) {
        openModal(log);
      }
    });
  });

  const meta = document.getElementById("practice-meta");
  if (meta && latest) {
    meta.textContent += " Last update " + lastUpdateText + ".";
  }
}

export function initializePracticePage(user) {
  currentUser = user;

  const modal = document.getElementById("log-modal");
  const closeButton = document.getElementById("close-modal");
  const editButton = document.getElementById("edit-my-log");
  const id = new URLSearchParams(location.search).get("id");

  if (!id) {
    document.getElementById("practice-title").textContent = "Practice not found";
    return;
  }

  editButton.addEventListener("click", function() {
    window.location.href = "./log-entry.html?practiceId=" + encodeURIComponent(id);
  });

  const deleteButton = document.getElementById("delete-practice");
  if (deleteButton) {
    deleteButton.addEventListener("click", async function() {
      if (deleting) return;

      const date = practice ? formatDateKey(practice.dateKey || practice.id) : "this practice";
      const confirmed = window.confirm(
        "Delete " + date + " permanently?\\n\\nThis will permanently delete the practice and every member log stored under it in Firebase. This cannot be undone."
      );
      if (!confirmed) return;

      deleting = true;
      deleteButton.disabled = true;
      editButton.disabled = true;
      deleteButton.textContent = "Deleting…";

      try {
        const result = await deletePracticeCompletely(id);
        alert(date + " was permanently deleted. " + result.deletedLogCount + " member " + (result.deletedLogCount === 1 ? "log" : "logs") + " were removed.");
        window.location.replace("./practices.html");
      } catch (error) {
        console.error("Practice deletion failed:", error);
        alert("Practice deletion failed: " + error.message);
        deleting = false;
        deleteButton.disabled = false;
        editButton.disabled = false;
        deleteButton.textContent = "Delete Practice";
      }
    });
  }
  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", function(event) {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") closeModal();
  });

  onSnapshot(
    doc(db, "practices", id),
    snapshot => {
      if (!snapshot.exists()) {
        document.getElementById("practice-title").textContent = "Practice not found";
        document.getElementById("practice-meta").textContent = "This practice record does not exist.";
        return;
      }
      practice = { id: snapshot.id, ...snapshot.data() };
      render();
    },
    error => {
      console.error("Practice read failed:", error);
      document.getElementById("practice-title").textContent = "Unable to load practice";
      document.getElementById("practice-meta").textContent = error.message;
    }
  );

  onSnapshot(
    collection(db, "practices", id, "logs"),
    snapshot => {
      logs = snapshot.docs.map(function(item) {
        return { id: item.id, ...item.data() };
      });
      render();
    },
    error => {
      console.error("Practice logs failed:", error);
      document.getElementById("team-tasks").innerHTML =
        '<div class="notice notice-danger">Logs could not be loaded: ' + esc(error.message) + '</div>';
    }
  );

  onSnapshot(
    collection(db, "users"),
    snapshot => {
      users = snapshot.docs
        .filter(function(item) { return item.data().active !== false; })
        .map(function(item) { return { id: item.id, ...item.data() }; })
        .sort(function(a, b) {
          return String(a.displayName || "").localeCompare(String(b.displayName || ""));
        });
      render();
    },
    error => {
      console.error("Team read failed:", error);
      document.getElementById("member-logs").innerHTML =
        '<div class="notice notice-danger">Team members could not be loaded: ' + esc(error.message) + '</div>';
    }
  );
}
