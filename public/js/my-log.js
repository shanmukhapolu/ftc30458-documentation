import { db } from "./firebase.js";
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from "./ui.js";

let currentUser = null;
let practice = null;
let existingLog = null;
let selectedPresets = [];

const areaDefinitions = {
  Mechanical: {
    description: "Building and physical mechanisms",
    fields: [
      ["activity","What did you build or change?","textarea"],
      ["result","What happened when you tested it?","textarea"],
      ["next","What should happen next?","input"]
    ],
    presets: [
      "Built or modified a robot mechanism.",
      "Iterated on a physical prototype.",
      "Changed the geometry or mounting of a robot component.",
      "Repaired or replaced a robot component."
    ]
  },
  Electrical: {
    description: "Wiring, motors, sensors and hardware",
    fields: [
      ["activity","What electrical work did you do?","textarea"],
      ["problem","What problem did you diagnose?","textarea"],
      ["result","What changed after your work?","textarea"]
    ],
    presets: [
      "Wired or rewired a robot subsystem.",
      "Installed or configured a motor, servo, or sensor.",
      "Troubleshot an electrical issue.",
      "Improved wiring organization or reliability."
    ]
  },
  CAD: {
    description: "Onshape and mechanical design",
    fields: [
      ["project","What component or project did you work on?","input"],
      ["activity","What did you design or change?","textarea"],
      ["reason","Why did the design change?","textarea"],
      ["result","What happened after the design change?","textarea"]
    ],
    presets: [
      "Created a new component or assembly in Onshape.",
      "Modified an existing robot component or assembly.",
      "Designed a bracket or mounting system.",
      "Updated geometry based on testing.",
      "Prepared a part for manufacturing."
    ]
  },
  Programming: {
    description: "Robot software and control",
    fields: [
      ["activity","What code did you write or change?","textarea"],
      ["tools","Which systems did you use?","input"],
      ["bug","What bug or unexpected behavior did you encounter?","textarea"],
      ["solution","How did you solve or address it?","textarea"],
      ["result","What changed after testing?","textarea"]
    ],
    presets: [
      "Wrote code for the intake of the robot.",
      "Wrote code for the shooter of the robot.",
      "Wrote code for the drivetrain of the robot.",
      "Configured PID or PIDF for more consistent control.",
      "Implemented or improved robot controls.",
      "Fixed a software bug or unexpected behavior."
    ]
  },
  Autonomous: {
    description: "Autonomous routines and pathing",
    fields: [
      ["activity","What autonomous work did you do?","textarea"],
      ["tool","What system did you use?","input"],
      ["problem","What failed or behaved unexpectedly?","textarea"],
      ["result","What did testing show?","textarea"]
    ],
    presets: [
      "Wrote or modified an autonomous routine.",
      "Created or changed a Pedro Pathing trajectory.",
      "Improved autonomous localization.",
      "Tested autonomous reliability."
    ]
  },
  TeleOp: {
    description: "Driver control and tuning",
    fields: [
      ["activity","What did you change?","textarea"],
      ["result","What improved or did not improve?","textarea"]
    ],
    presets: [
      "Improved TeleOp controls for the robot.",
      "Adjusted control sensitivity or response.",
      "Tested driver control under match-like conditions."
    ]
  },
  Vision: {
    description: "Limelight, AprilTags and vision",
    fields: [
      ["activity","What vision work did you do?","textarea"],
      ["tool","What system did you use?","input"],
      ["result","What did testing show?","textarea"]
    ],
    presets: [
      "Configured Limelight vision processing.",
      "Implemented or improved AprilTag detection.",
      "Tested vision-based localization or alignment."
    ]
  },
  Testing: {
    description: "Experiments and measurements",
    fields: [
      ["activity","What did you test?","textarea"],
      ["trials","How many trials or configurations?","input"],
      ["result","What were the results?","textarea"],
      ["conclusion","What did the test tell you?","textarea"]
    ],
    presets: [
      "Tested multiple design or software configurations.",
      "Collected measurements to guide an engineering decision.",
      "Measured robot performance across repeated trials.",
      "Compared two or more approaches."
    ]
  },
  Strategy: {
    description: "Game analysis and planning",
    fields: [
      ["activity","What strategy work did you do?","textarea"],
      ["decision","What did you decide and why?","textarea"]
    ],
    presets: [
      "Analyzed game scoring and strategy.",
      "Compared different robot strategy options.",
      "Developed a competition or match strategy."
    ]
  },
  Outreach: {
    description: "Events, community and partnerships",
    fields: [
      ["contactCount","How many people or organizations did you contact?","input"],
      ["contacted","Who did you contact?","input"],
      ["activity","What did you work on?","textarea"],
      ["result","What happened or what is the next step?","textarea"]
    ],
    presets: [
      "Contacted an organization regarding an outreach event opportunity.",
      "Planned or coordinated an outreach event.",
      "Coordinated with another team for mentorship or partnership.",
      "Participated in or prepared for a community STEM event."
    ]
  },
  Sponsorship: {
    description: "Sponsors, fundraising and partnerships",
    fields: [
      ["count","How many companies or contacts did you reach?","input"],
      ["contacted","Who did you contact?","input"],
      ["activity","What did you work on?","textarea"],
      ["result","What happened or what is the next step?","textarea"]
    ],
    presets: [
      "Sent sponsor outreach emails to gain financial support for the team.",
      "Followed up with potential sponsors.",
      "Prepared sponsorship materials or a sponsor presentation.",
      "Coordinated sponsor recognition or deliverables."
    ]
  },
  Manufacturing: {
    description: "3D printing and fabrication",
    fields: [
      ["activity","What did you manufacture?","textarea"],
      ["result","How did the manufactured part perform?","textarea"]
    ],
    presets: [
      "3D printed a component for the robot.",
      "Manufactured a component from the CAD design.",
      "Modified a manufactured component to improve fit or performance."
    ]
  }
};

function esc(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function formatDateKey(key) {
  const parts = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {month:"long",day:"numeric",year:"numeric"}).format(new Date(parts[0], parts[1]-1, parts[2]));
}

function getSelectedAreas() {
  return Array.from(document.querySelectorAll('input[name="workArea"]:checked')).map(function(input){
    return input.value;
  });
}

function renderForm() {
  const form = document.getElementById("log-form");

  const areas = Object.keys(areaDefinitions).map(function(area) {
    const def = areaDefinitions[area];
    return '<div class="work-area-option">' +
      '<input id="area-' + slug(area) + '" type="checkbox" name="workArea" value="' + esc(area) + '">' +
      '<label for="area-' + slug(area) + '"><strong>' + esc(area) + '</strong><span>' + esc(def.description) + '</span></label>' +
    '</div>';
  }).join("");

  form.innerHTML =
    '<section class="card-shell" style="padding:22px;margin-bottom:16px">' +
      '<div class="area-heading"><h3>What did you work on?</h3><span>Select all that apply</span></div>' +
      '<div class="work-area-grid">' + areas + '</div>' +
    '</section>' +
    '<div id="dynamic-sections"></div>' +
    '<section class="card-shell" style="padding:22px;margin-bottom:16px">' +
      '<div class="area-heading"><h3>Main accomplishment</h3><span>Make the result obvious</span></div>' +
      '<div class="form-group"><label class="form-label">Quick phrases</label><div id="global-presets" class="preset-list"></div><div class="form-hint">Click a phrase to add it. Click it again to remove it.</div></div>' +
      '<div class="form-group"><label class="form-label" for="major-accomplishment">Your accomplishment</label><textarea id="major-accomplishment" class="form-textarea" placeholder="What is the clearest thing you accomplished today?"></textarea></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="lesson">What did you learn?</label><textarea id="lesson" class="form-textarea" placeholder="Technical lesson, design lesson, workflow lesson…"></textarea></div>' +
        '<div class="form-group"><label class="form-label" for="next-step">What should happen next?</label><textarea id="next-step" class="form-textarea" placeholder="The next concrete step…"></textarea></div>' +
      '</div>' +
    '</section>';

  document.querySelectorAll('input[name="workArea"]').forEach(function(input) {
    input.addEventListener("change", function() {
      renderDynamicSections();
      updateSummary();
    });
  });

  document.getElementById("major-accomplishment").addEventListener("input", updateSummary);
  document.getElementById("lesson").addEventListener("input", updateSummary);
  document.getElementById("next-step").addEventListener("input", updateSummary);

  renderDynamicSections();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function renderDynamicSections() {
  const container = document.getElementById("dynamic-sections");
  const selected = getSelectedAreas();

  container.innerHTML = selected.map(function(area) {
    const def = areaDefinitions[area];
    const fields = def.fields.map(function(field) {
      const id = slug(area) + "-" + field[0];
      const tag = field[2] === "textarea" ? "textarea" : "input";
      const className = field[2] === "textarea" ? "form-textarea" : "form-input";
      return '<div class="form-group"><label class="form-label" for="' + id + '">' + esc(field[1]) + '</label>' +
        (tag === "textarea"
          ? '<textarea id="' + id + '" class="' + className + '" rows="4"></textarea>'
          : '<input id="' + id + '" class="' + className + '" type="' + (field[0].toLowerCase().includes("count") ? "number" : "text") + '">') +
      '</div>';
    }).join("");

    return '<section class="card-shell dynamic-area visible" style="padding:22px;margin-bottom:16px" data-area="' + esc(area) + '">' +
      '<div class="area-heading"><h3>' + esc(area) + '</h3><span>' + esc(def.description) + '</span></div>' +
      '<div class="preset-list" data-area-presets="' + esc(area) + '" style="margin-bottom:16px"></div>' +
      '<div class="form-row">' + fields + '</div>' +
    '</section>';
  }).join("");

  selected.forEach(function(area) {
    const presetContainer = document.querySelector('[data-area-presets="' + CSS.escape(area) + '"]');
    const def = areaDefinitions[area];
    if (!presetContainer) return;

    presetContainer.innerHTML = def.presets.map(function(text) {
      const selectedClass = selectedPresets.includes(text) ? " selected" : "";
      return '<button type="button" class="preset-button' + selectedClass + '" data-preset="' + esc(text) + '">' + esc(text) + '</button>';
    }).join("");

    presetContainer.querySelectorAll("[data-preset]").forEach(function(button) {
      button.addEventListener("click", function() {
        const text = button.dataset.preset;
        if (selectedPresets.includes(text)) {
          selectedPresets = selectedPresets.filter(function(item){ return item !== text; });
        } else {
          selectedPresets.push(text);
        }

        button.classList.toggle("selected", selectedPresets.includes(text));

        const field = document.getElementById("major-accomplishment");
        if (selectedPresets.length && !field.dataset.manual) {
          field.value = selectedPresets.join(" ");
        }

        updateSummary();
      });
    });
  });
}

function collectData() {
  const workAreas = getSelectedAreas();
  const details = {};

  workAreas.forEach(function(area) {
    const def = areaDefinitions[area];
    details[area] = {};

    def.fields.forEach(function(field) {
      const element = document.getElementById(slug(area) + "-" + field[0]);
      if (element) details[area][field[0]] = element.value.trim();
    });
  });

  return {
    practiceId: practice.id,
    userId: currentUser.uid,
    memberName: currentUser.displayName || (currentUser.email ? currentUser.email.split("@")[0] : "Team Member"),
    memberEmail: currentUser.email || "",
    workAreas: workAreas,
    selectedPresets: selectedPresets,
    majorAccomplishment: document.getElementById("major-accomplishment").value.trim(),
    lesson: document.getElementById("lesson").value.trim(),
    nextStep: document.getElementById("next-step").value.trim(),
    details: details,
    updatedAt: serverTimestamp(),
    createdAt: existingLog && existingLog.createdAt ? existingLog.createdAt : serverTimestamp()
  };
}

function populateExistingLog(log) {
  existingLog = log || null;

  const selected = Array.isArray(log && log.workAreas) ? log.workAreas : [];
  const presets = Array.isArray(log && log.selectedPresets) ? log.selectedPresets : [];

  selectedPresets = presets.slice();

  document.querySelectorAll('input[name="workArea"]').forEach(function(input) {
    input.checked = selected.includes(input.value);
  });

  renderDynamicSections();

  selected.forEach(function(area) {
    const values = (log.details && log.details[area]) || {};
    (areaDefinitions[area] || { fields: [] }).fields.forEach(function(field) {
      const element = document.getElementById(slug(area) + "-" + field[0]);
      if (element && values[field[0]] !== undefined) element.value = values[field[0]];
    });
  });

  document.getElementById("major-accomplishment").value = log.majorAccomplishment || "";
  document.getElementById("lesson").value = log.lesson || "";
  document.getElementById("next-step").value = log.nextStep || "";

  document.getElementById("major-accomplishment").dataset.manual =
    log.majorAccomplishment && presets.length ? "true" : "";

  updateSummary();
  updateSaveIndicator("Saved");
}

function updateSummary() {
  const areas = getSelectedAreas();
  const accomplishment = document.getElementById("major-accomplishment");
  const lesson = document.getElementById("lesson");
  const next = document.getElementById("next-step");

  document.getElementById("sum-areas").textContent = areas.length;
  document.getElementById("sum-presets").textContent = selectedPresets.length;
  document.getElementById("sum-accomplishment").textContent = accomplishment.value.trim() ? "Added" : "Missing";
  document.getElementById("sum-lesson").textContent = lesson.value.trim() ? "Added" : "Missing";
  document.getElementById("sum-next").textContent = next.value.trim() ? "Added" : "Missing";
}

function updateSaveIndicator(text) {
  document.getElementById("save-indicator").textContent = text;
  document.getElementById("save-title").textContent = text;
  document.getElementById("save-detail").textContent = text === "Saved" ? "Everyone can see your latest version immediately." : "Changes stay in this form until you save.";
}

async function saveLog() {
  const data = collectData();

  if (!data.workAreas.length) {
    showToast("Select at least one work area.", "warning");
    return;
  }

  if (!data.majorAccomplishment) {
    showToast("Add your major accomplishment.", "warning");
    return;
  }

  if (!data.lesson) {
    showToast("Add at least one lesson learned.", "warning");
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

    existingLog = data;
    updateSaveIndicator("Saved");
    showToast("Your log is saved and synced.", "success");
  } catch (error) {
    console.error(error);
    showToast("Unable to save your log.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Save Log";
  }
}

export async function initializePracticeLog(user) {
  currentUser = user;

  const params = new URLSearchParams(window.location.search);
  const practiceId = params.get("practiceId");

  if (!practiceId) {
    window.location.href = "./practices.html";
    return;
  }

  const practiceReference = doc(db, "practices", practiceId);

  const practiceSnapshot = await getDoc(practiceReference);
  if (!practiceSnapshot.exists()) {
    document.getElementById("practice-context").textContent = "That practice does not exist.";
    return;
  }

  practice = { id: practiceSnapshot.id, ...practiceSnapshot.data() };
  document.getElementById("practice-context").textContent =
    "Document your work for " + formatDateKey(practice.dateKey || practice.id) + ".";

  renderForm();

  onSnapshot(doc(db, "practices", practiceId, "logs", currentUser.uid), function(snapshot) {
    if (snapshot.exists()) populateExistingLog(snapshot.data());
  });

  document.getElementById("save-log").addEventListener("click", saveLog);

  document.getElementById("cancel-log").addEventListener("click", function() {
    window.location.href = "./practice.html?id=" + encodeURIComponent(practice.id);
  });

  document.getElementById("major-accomplishment").addEventListener("input", function() {
    this.dataset.manual = "true";
    updateSummary();
  });
}

function formatDateKey(key) {
  const parts = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {month:"long",day:"numeric",year:"numeric"}).format(new Date(parts[0], parts[1]-1, parts[2]));
}
