import { db } from "./firebase.js?v=20260920-01";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js?v=20260926-02";

let currentUser = null;
let practice = null;
let existingLog = null;
let tasks = [];
let nextSteps = [];
let dirty = false;
let initialHydration = true;

function practiceStartMs(practice) {
  if (Number.isFinite(Number(practice?.startAtMs))) return Number(practice.startAtMs);
  if (practice?.dateKey) {
    const [y,m,d] = practice.dateKey.split("-").map(Number);
    return new Date(y,m-1,d).getTime();
  }
  return 0;
}

const categories = [
  "Mechanical",
  "Electrical",
  "CAD",
  "Programming",
  "Autonomous",
  "TeleOp",
  "Vision",
  "Testing",
  "Strategy",
  "Outreach",
  "Sponsorship",
  "Manufacturing",
  "Documentation",
  "Other"
];

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
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "Practice";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(parts[0], parts[1] - 1, parts[2]));
}

function optionMarkup(selected) {
  return categories.map(function(category) {
    return '<option value="' + esc(category) + '"' + (category === selected ? " selected" : "") + '>' + esc(category) + '</option>';
  }).join("");
}

function normalizeTask(value, fallbackCategory) {
  if (typeof value === "string") {
    return { text: value.trim(), category: fallbackCategory || "Other" };
  }
  return {
    text: String(value?.text || "").trim(),
    category: String(value?.category || fallbackCategory || "Other").trim() || "Other"
  };
}

function legacyTasks(log) {
  if (Array.isArray(log?.tasks) && log.tasks.length) {
    return log.tasks.map(function(task) {
      return normalizeTask(task, "Other");
    }).filter(function(task) { return task.text; });
  }

  if (Array.isArray(log?.selectedPresets) && log.selectedPresets.length) {
    const areas = Array.isArray(log.workAreas) ? log.workAreas : [];
    return log.selectedPresets.map(function(text, index) {
      return normalizeTask(text, areas[index] || areas[0] || "Other");
    }).filter(function(task) { return task.text; });
  }

  if (log?.majorAccomplishment) {
    return [normalizeTask(
      log.majorAccomplishment,
      Array.isArray(log.workAreas) && log.workAreas[0] ? log.workAreas[0] : "Other"
    )];
  }

  return [{ text: "", category: "Mechanical" }];
}

function legacyNextSteps(log) {
  if (Array.isArray(log?.nextSteps) && log.nextSteps.length) {
    return log.nextSteps.map(function(step) {
      return normalizeTask(step, "Other");
    }).filter(function(step) { return step.text; });
  }

  if (log?.nextStep) {
    return [normalizeTask(
      log.nextStep,
      Array.isArray(log.workAreas) && log.workAreas[0] ? log.workAreas[0] : "Other"
    )];
  }

  return [{ text: "", category: "Mechanical" }];
}

function markDirty() {
  dirty = true;
  updateSaveIndicator("Unsaved changes");
}

function renderTaskEditor() {
  const container = document.getElementById("task-editor-list");
  if (!container) return;

  if (!tasks.length) tasks = [{ text: "", category: "Mechanical" }];

  container.innerHTML = tasks.map(function(task, index) {
    return '<li class="task-editor-row">' +
      '<span class="task-bullet" aria-hidden="true">•</span>' +
      '<input class="form-input task-text-input" data-task-text="' + index + '" type="text" value="' + esc(task.text) + '" placeholder="e.g., Built a mecanum chassis">' +
      '<select class="form-select task-category-select" data-task-category="' + index + '" aria-label="Task category">' +
        optionMarkup(task.category) +
      '</select>' +
      '<button class="icon-button task-remove-button" data-task-remove="' + index + '" type="button" aria-label="Remove task">×</button>' +
    '</li>';
  }).join("");

  container.querySelectorAll("[data-task-text]").forEach(function(input) {
    input.addEventListener("input", function() {
      tasks[Number(input.dataset.taskText)].text = input.value;
      markDirty();
      updateSummary();
    });
  });

  container.querySelectorAll("[data-task-category]").forEach(function(select) {
    select.addEventListener("change", function() {
      tasks[Number(select.dataset.taskCategory)].category = select.value;
      markDirty();
      updateSummary();
    });
  });

  container.querySelectorAll("[data-task-remove]").forEach(function(button) {
    button.addEventListener("click", function() {
      const index = Number(button.dataset.taskRemove);
      if (tasks.length === 1) {
        tasks[0] = { text: "", category: "Mechanical" };
      } else {
        tasks.splice(index, 1);
      }
      dirty = true;
      renderTaskEditor();
      updateSummary();
      updateSaveIndicator("Unsaved changes");
    });
  });
}

function renderNextStepEditor() {
  const container = document.getElementById("next-step-editor-list");
  if (!container) return;

  if (!nextSteps.length) nextSteps = [{ text: "", category: "Mechanical" }];

  container.innerHTML = nextSteps.map(function(step, index) {
    return '<li class="task-editor-row">' +
      '<span class="task-bullet" aria-hidden="true">•</span>' +
      '<input class="form-input task-text-input" data-next-text="' + index + '" type="text" value="' + esc(step.text) + '" placeholder="e.g., Tune the intake transfer timing">' +
      '<select class="form-select task-category-select" data-next-category="' + index + '" aria-label="Next step category">' +
        optionMarkup(step.category) +
      '</select>' +
      '<button class="icon-button task-remove-button" data-next-remove="' + index + '" type="button" aria-label="Remove next step">×</button>' +
    '</li>';
  }).join("");

  container.querySelectorAll("[data-next-text]").forEach(function(input) {
    input.addEventListener("input", function() {
      nextSteps[Number(input.dataset.nextText)].text = input.value;
      markDirty();
      updateSummary();
    });
  });

  container.querySelectorAll("[data-next-category]").forEach(function(select) {
    select.addEventListener("change", function() {
      nextSteps[Number(select.dataset.nextCategory)].category = select.value;
      markDirty();
      updateSummary();
    });
  });

  container.querySelectorAll("[data-next-remove]").forEach(function(button) {
    button.addEventListener("click", function() {
      const index = Number(button.dataset.nextRemove);
      if (nextSteps.length === 1) {
        nextSteps[0] = { text: "", category: "Mechanical" };
      } else {
        nextSteps.splice(index, 1);
      }
      dirty = true;
      renderNextStepEditor();
      updateSummary();
      updateSaveIndicator("Unsaved changes");
    });
  });
}

function updateSummary() {
  const nonEmptyTasks = tasks.filter(function(task) { return task.text.trim(); });
  const nonEmptyNext = nextSteps.filter(function(step) { return step.text.trim(); });
  const usedCategories = new Set();
  nonEmptyTasks.forEach(function(task) { usedCategories.add(task.category); });
  nonEmptyNext.forEach(function(step) { usedCategories.add(step.category); });

  document.getElementById("sum-tasks").textContent = nonEmptyTasks.length;
  document.getElementById("sum-categories").textContent = usedCategories.size;
  document.getElementById("sum-learned").textContent = document.getElementById("learned").value.trim() ? "Added" : "Missing";
  document.getElementById("sum-next-steps").textContent = nonEmptyNext.length;
}

function updateSaveIndicator(text) {
  document.getElementById("save-indicator").textContent = text;
  document.getElementById("save-title").textContent = text;
  document.getElementById("save-detail").textContent = text === "Saved"
    ? "Everyone can see your current practice documentation."
    : "Your changes stay local until you save.";
}

function populateExistingLog(log) {
  existingLog = log || null;
  tasks = legacyTasks(log || {});
  nextSteps = legacyNextSteps(log || {});
  document.getElementById("learned").value = String(log?.learned || log?.lesson || "");

  renderTaskEditor();
  renderNextStepEditor();
  updateSummary();
  dirty = false;
  initialHydration = false;
  updateSaveIndicator(log ? "Saved" : "Ready");
}

function collectData() {
  const cleanTasks = tasks
    .map(function(task) { return normalizeTask(task, task.category); })
    .filter(function(task) { return task.text; });
  const cleanNextSteps = nextSteps
    .map(function(step) { return normalizeTask(step, step.category); })
    .filter(function(step) { return step.text; });

  return {
    practiceId: practice.id,
    userId: currentUser.uid,
    memberName: currentUser.displayName || (currentUser.email ? currentUser.email.split("@")[0] : "Team Member"),
    memberEmail: currentUser.email || "",
    tasks: cleanTasks,
    learned: document.getElementById("learned").value.trim(),
    nextSteps: cleanNextSteps,
    updatedAt: serverTimestamp(),
    createdAt: existingLog?.createdAt || serverTimestamp()
  };
}

async function saveLog() {
  const data = collectData();

  if (!data.tasks.length) {
    showToast("Add at least one completed task.", "warning");
    return;
  }
  if (data.tasks.some(function(task) { return !task.category; })) {
    showToast("Choose a category for every task.", "warning");
    return;
  }
  if (!data.learned) {
    showToast("Add a reflection about what you learned.", "warning");
    return;
  }
  if (!data.nextSteps.length) {
    showToast("Add at least one next step.", "warning");
    return;
  }

  const button = document.getElementById("save-log");
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await setDoc(
      doc(db, "practices", practice.id, "logs", currentUser.uid),
      data,
      { merge: true }
    );

    existingLog = { ...(existingLog || {}), ...data };
    dirty = false;
    updateSaveIndicator("Saved");
    showToast("Your practice log is saved and synced.", "success");
  } catch (error) {
    console.error("Log save failed:", error);
    showToast("Unable to save your log: " + error.message, "error", 7000);
  } finally {
    button.disabled = false;
    button.textContent = "Save Log";
  }
}

export async function initializeLogEntry(user) {
  currentUser = user;

  const practiceId = new URLSearchParams(window.location.search).get("practiceId");
  if (!practiceId) {
    window.location.replace("./my-log.html");
    return;
  }

  document.getElementById("learned").addEventListener("input", function() {
    markDirty();
    updateSummary();
  });

  document.getElementById("add-task").addEventListener("click", function() {
    tasks.push({ text: "", category: "Mechanical" });
    renderTaskEditor();
    updateSummary();
    document.querySelector("[data-task-text='" + (tasks.length - 1) + "']")?.focus();
    markDirty();
  });

  document.getElementById("add-next-step").addEventListener("click", function() {
    nextSteps.push({ text: "", category: "Mechanical" });
    renderNextStepEditor();
    updateSummary();
    document.querySelector("[data-next-text='" + (nextSteps.length - 1) + "']")?.focus();
    markDirty();
  });

  let practiceSnapshot;
  try {
    practiceSnapshot = await getDoc(doc(db, "practices", practiceId));
  } catch (error) {
    console.error("Practice read failed:", error);
    document.getElementById("log-context").textContent = "Unable to load this practice: " + error.message;
    showToast("Practice could not be loaded: " + error.message, "error", 7000);
    return;
  }

  if (!practiceSnapshot.exists()) {
    document.getElementById("log-title").textContent = "Practice not found";
    document.getElementById("log-context").textContent = "This practice record does not exist.";
    return;
  }

  practice = { id: practiceSnapshot.id, ...practiceSnapshot.data() };

  const attendanceSnapshot = await getDoc(doc(db, "practices", practiceId, "attendance", currentUser.uid));
  const attendance = attendanceSnapshot.exists() ? attendanceSnapshot.data() : null;
  const future = practiceStartMs(practice) > Date.now();

  if (future) {
    document.getElementById("log-title").textContent = practice.title || "Future practice";
    document.getElementById("log-context").textContent = "This practice has not started yet. Logging opens at the scheduled start time.";
    document.getElementById("save-log").disabled = true;
    setTimeout(() => window.location.replace("./practice.html?id=" + encodeURIComponent(practiceId)), 900);
    return;
  }

  if (attendance?.status === "not_present") {
    document.getElementById("log-title").textContent = practice.title || "Practice";
    document.getElementById("log-context").textContent = "You are marked not present for this practice, so no log is required.";
    document.getElementById("save-log").disabled = true;
    setTimeout(() => window.location.replace("./practice.html?id=" + encodeURIComponent(practiceId)), 900);
    return;
  }

  const dateKey = practice.dateKey || practice.id;
  document.getElementById("log-title").textContent = practice.title || formatDateKey(dateKey);
  document.getElementById("log-context").textContent =
    "Document each concrete task, then record what you learned and what you plan to do next." +
    (practice.startTime && practice.endTime ? " Practice time: " + practice.startTime + "–" + practice.endTime + "." : "");

  renderTaskEditor();
  renderNextStepEditor();
  updateSummary();
  updateSaveIndicator("Ready");

  onSnapshot(
    doc(db, "practices", practiceId, "logs", currentUser.uid),
    snapshot => {
      if (snapshot.exists()) {
        if (!dirty || initialHydration) {
          populateExistingLog(snapshot.data());
        }
      } else if (initialHydration) {
        populateExistingLog(null);
      }
    },
    error => {
      console.error("Log read failed:", error);
      showToast("Your existing log could not be loaded: " + error.message, "error", 7000);
    }
  );

  document.getElementById("save-log").addEventListener("click", saveLog);
}
