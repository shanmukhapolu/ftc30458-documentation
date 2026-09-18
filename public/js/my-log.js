// public/js/my-log.js

import {
  db
} from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  showToast,
  setButtonLoading
} from "./ui.js";

const SEASON_ID = "2026-27";

let currentUser = null;
let currentPractice = null;
let currentLog = null;
let isSubmitted = false;
let autosaveTimer = null;

/*
 * Keep a local copy too. This protects a user's work
 * if they accidentally refresh or lose connection
 * before hitting Save Draft.
 */
let localDraftKey = "";

/* =========================================================
   FIELD CONFIGURATION
   ========================================================= */

const AREA_SECTION_MAP = {
  Mechanical: "section-mechanical",
  Electrical: "section-electrical",
  CAD: "section-cad",
  Programming: "section-programming",
  Autonomous: "section-autonomous",
  TeleOp: "section-teleop",
  Vision: "section-vision",
  Testing: "section-testing",
  Strategy: "section-strategy",
  Outreach: "section-outreach",
  Sponsorship: "section-sponsorship",
  Manufacturing: "section-manufacturing"
};


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const loadingElement =
  document.getElementById(
    "log-loading"
  );

const contentElement =
  document.getElementById(
    "log-content"
  );

const errorElement =
  document.getElementById(
    "log-error"
  );

const errorMessageElement =
  document.getElementById(
    "log-error-message"
  );

const errorBackLink =
  document.getElementById(
    "error-back-link"
  );

const practiceContextDate =
  document.getElementById(
    "practice-context-date"
  );

const practiceContextTitle =
  document.getElementById(
    "practice-context-title"
  );

const workAreaCheckboxes =
  Array.from(
    document.querySelectorAll(
      'input[name="workAreas"]'
    )
  );

const areaSelectionHelp =
  document.getElementById(
    "area-selection-help"
  );

const saveStatusTitle =
  document.getElementById(
    "save-status-title"
  );

const saveStatusDetail =
  document.getElementById(
    "save-status-detail"
  );

const saveDraftButton =
  document.getElementById(
    "save-draft-button"
  );

const submitLogButton =
  document.getElementById(
    "submit-log-button"
  );

const cancelButton =
  document.getElementById(
    "cancel-button"
  );

const summaryAreaCount =
  document.getElementById(
    "summary-area-count"
  );

const summaryPresetCount =
  document.getElementById(
    "summary-preset-count"
  );

const summaryAccomplishmentStatus =
  document.getElementById(
    "summary-accomplishment-status"
  );

const summaryLessonStatus =
  document.getElementById(
    "summary-lesson-status"
  );

const summaryNextStatus =
  document.getElementById(
    "summary-next-status"
  );


/* =========================================================
   INITIALIZE
   ========================================================= */

/**
 * Initialize the member log page.
 *
 * @param {import("firebase/auth").User} user
 */
export async function initializePracticeLog(user) {
  currentUser = user;

  wireWorkAreaListeners();
  wirePresetButtons();
  wireFormListeners();

  const params =
    new URLSearchParams(
      window.location.search
    );

  let practiceId =
    params.get("practiceId");

  try {
    if (!practiceId) {
      practiceId =
        await findCurrentPracticeId();
    }

    if (!practiceId) {
      showError(
        "There is no active practice available to document."
      );

      return;
    }

    await loadPractice(
      practiceId
    );

    localDraftKey =
      `ftc30458-log-${currentPractice.id}-${currentUser.uid}`;

    await loadExistingLog();

    restoreLocalDraftIfUseful();

    renderPracticeContext();
    updateDynamicSections();
    updateSummary();
    updateSaveState();

    hideLoading();
  } catch (error) {
    console.error(
      "Failed to initialize practice log:",
      error
    );

    showError(
      "Unable to load this practice log. Please try again."
    );

    showToast(
      "Unable to load your practice log.",
      "error"
    );
  }
}


/* =========================================================
   FIND CURRENT PRACTICE
   ========================================================= */

async function findCurrentPracticeId() {
  const practicesReference =
    collection(
      db,
      "seasons",
      SEASON_ID,
      "practices"
    );

  const practicesQuery =
    query(
      practicesReference,
      orderBy(
        "practiceNumber",
        "desc"
      )
    );

  const snapshot =
    await getDocs(
      practicesQuery
    );

  const activePractice =
    snapshot.docs
      .map((item) => ({
        id: item.id,
        ...item.data()
      }))
      .find(
        (practice) =>
          practice.status ===
            "in-progress" ||
          practice.status ===
            "ready"
      );

  return (
    activePractice?.id ||
    null
  );
}


/* =========================================================
   LOAD PRACTICE
   ========================================================= */

async function loadPractice(
  practiceId
) {
  const reference =
    doc(
      db,
      "seasons",
      SEASON_ID,
      "practices",
      practiceId
    );

  const snapshot =
    await getDoc(
      reference
    );

  if (!snapshot.exists()) {
    throw new Error(
      "Practice not found."
    );
  }

  currentPractice = {
    id: snapshot.id,
    ...snapshot.data()
  };

  errorBackLink.href =
    `./practice.html?id=${encodeURIComponent(
      currentPractice.id
    )}`;
}


/* =========================================================
   LOAD EXISTING USER LOG
   ========================================================= */

async function loadExistingLog() {
  const logReference =
    doc(
      db,
      "seasons",
      SEASON_ID,
      "practices",
      currentPractice.id,
      "logs",
      currentUser.uid
    );

  const snapshot =
    await getDoc(
      logReference
    );

  if (!snapshot.exists()) {
    currentLog = null;
    isSubmitted = false;
    return;
  }

  currentLog = {
    id: snapshot.id,
    ...snapshot.data()
  };

  isSubmitted =
    currentLog.status ===
    "submitted";

  populateForm(
    currentLog
  );
}


/* =========================================================
   POPULATE FORM
   ========================================================= */

function populateForm(data) {
  const workTypes =
    Array.isArray(
      data.workTypes
    )
      ? data.workTypes
      : [];

  workAreaCheckboxes.forEach(
    (checkbox) => {
      checkbox.checked =
        workTypes.includes(
          checkbox.value
        );
    }
  );

  setValue(
    "programming-activity",
    data.details?.programming?.activity
  );

  setValue(
    "programming-tools",
    data.details?.programming?.tools
  );

  setValue(
    "programming-result",
    data.details?.programming?.result
  );

  setValue(
    "programming-bug",
    data.details?.programming?.bug
  );

  setValue(
    "programming-solution",
    data.details?.programming?.solution
  );


  setValue(
    "cad-project",
    data.details?.cad?.project
  );

  setValue(
    "cad-activity",
    data.details?.cad?.activity
  );

  setValue(
    "cad-reason",
    data.details?.cad?.reason
  );

  setValue(
    "cad-result",
    data.details?.cad?.result
  );


  setValue(
    "mechanical-activity",
    data.details?.mechanical?.activity
  );

  setValue(
    "mechanical-result",
    data.details?.mechanical?.result
  );

  setValue(
    "mechanical-next",
    data.details?.mechanical?.next
  );


  setValue(
    "electrical-activity",
    data.details?.electrical?.activity
  );

  setValue(
    "electrical-problem",
    data.details?.electrical?.problem
  );

  setValue(
    "electrical-result",
    data.details?.electrical?.result
  );


  setValue(
    "autonomous-activity",
    data.details?.autonomous?.activity
  );

  setValue(
    "autonomous-tool",
    data.details?.autonomous?.tool
  );

  setValue(
    "autonomous-result",
    data.details?.autonomous?.result
  );

  setValue(
    "autonomous-problem",
    data.details?.autonomous?.problem
  );


  setValue(
    "teleop-activity",
    data.details?.teleop?.activity
  );

  setValue(
    "teleop-result",
    data.details?.teleop?.result
  );


  setValue(
    "vision-activity",
    data.details?.vision?.activity
  );

  setValue(
    "vision-result",
    data.details?.vision?.result
  );


  setValue(
    "testing-activity",
    data.details?.testing?.activity
  );

  setValue(
    "testing-trials",
    data.details?.testing?.trials
  );

  setValue(
    "testing-result",
    data.details?.testing?.result
  );

  setValue(
    "testing-conclusion",
    data.details?.testing?.conclusion
  );


  setValue(
    "strategy-activity",
    data.details?.strategy?.activity
  );

  setValue(
    "strategy-decision",
    data.details?.strategy?.decision
  );


  setValue(
    "outreach-contact-count",
    data.details?.outreach?.contactCount
  );

  setValue(
    "outreach-contacted",
    data.details?.outreach?.contacted
  );

  setValue(
    "outreach-activity",
    data.details?.outreach?.activity
  );

  setValue(
    "outreach-result",
    data.details?.outreach?.result
  );


  setValue(
    "sponsorship-count",
    data.details?.sponsorship?.count
  );

  setValue(
    "sponsorship-contacted",
    data.details?.sponsorship?.contacted
  );

  setValue(
    "sponsorship-activity",
    data.details?.sponsorship?.activity
  );

  setValue(
    "sponsorship-result",
    data.details?.sponsorship?.result
  );


  setValue(
    "manufacturing-activity",
    data.details?.manufacturing?.activity
  );

  setValue(
    "manufacturing-result",
    data.details?.manufacturing?.result
  );


  setValue(
    "overall-summary",
    data.overallSummary
  );

  setValue(
    "main-lesson",
    data.lesson
  );

  setValue(
    "main-next-step",
    data.nextStep
  );

  markPresetButtonsFromData(
    data
  );
}


/* =========================================================
   PRACTICE CONTEXT
   ========================================================= */

function renderPracticeContext() {
  const number =
    currentPractice.practiceNumber;

  practiceContextTitle.textContent =
    currentPractice.title ||
    `Practice #${number}`;

  practiceContextDate.textContent =
    formatPracticeDate(
      currentPractice.date ||
        currentPractice.createdAt
    );
}


/* =========================================================
   WORK-AREA VISIBILITY
   ========================================================= */

function wireWorkAreaListeners() {
  workAreaCheckboxes.forEach(
    (checkbox) => {
      checkbox.addEventListener(
        "change",
        () => {
          updateDynamicSections();
          updateSummary();
          scheduleAutosave();
        }
      );
    }
  );
}

function updateDynamicSections() {
  const selectedAreas =
    getSelectedWorkAreas();

  Object.entries(
    AREA_SECTION_MAP
  ).forEach(
    ([area, sectionId]) => {
      const section =
        document.getElementById(
          sectionId
        );

      if (!section) {
        return;
      }

      section.classList.toggle(
        "visible",
        selectedAreas.includes(area)
      );
    }
  );

  if (
    selectedAreas.length === 0
  ) {
    areaSelectionHelp.textContent =
      "Select at least one work area.";

    areaSelectionHelp.style.color =
      "var(--danger)";
  } else {
    areaSelectionHelp.textContent =
      `${selectedAreas.length} ${
        selectedAreas.length === 1
          ? "area"
          : "areas"
      } selected.`;

    areaSelectionHelp.style.color =
      "var(--muted)";
  }
}

function getSelectedWorkAreas() {
  return workAreaCheckboxes
    .filter(
      (checkbox) =>
        checkbox.checked
    )
    .map(
      (checkbox) =>
        checkbox.value
    );
}


/* =========================================================
   PRESET BUTTONS
   ========================================================= */

function wirePresetButtons() {
  document
    .querySelectorAll(
      "[data-preset-target]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const targetId =
              button.dataset
                .presetTarget;

            const value =
              button.dataset
                .presetValue || "";

            const target =
              document.getElementById(
                targetId
              );

            if (!target) {
              return;
            }

            const existing =
              target.value.trim();

            if (!existing) {
              target.value = value;
            } else if (
              !existing.includes(value)
            ) {
              target.value =
                `${existing} ${value}`;
            }

            button.classList.add(
              "selected"
            );

            target.dispatchEvent(
              new Event(
                "input",
                {
                  bubbles: true
                }
              )
            );

            updateSummary();
            scheduleAutosave();
          }
        );
      }
    );
}

function markPresetButtonsFromData(
  data
) {
  const textValues =
    collectAllMeaningfulText(
      data
    );

  document
    .querySelectorAll(
      "[data-preset-value]"
    )
    .forEach(
      (button) => {
        const value =
          button.dataset
            .presetValue || "";

        if (
          textValues.some(
            (text) =>
              text.includes(value)
          )
        ) {
          button.classList.add(
            "selected"
          );
        }
      }
    );
}


/* =========================================================
   FORM LISTENERS
   ========================================================= */

function wireFormListeners() {
  document
    .querySelectorAll(
      "input, textarea, select"
    )
    .forEach(
      (field) => {
        field.addEventListener(
          "input",
          () => {
            updateSummary();
            scheduleAutosave();
          }
        );

        field.addEventListener(
          "change",
          () => {
            updateSummary();
            scheduleAutosave();
          }
        );
      }
    );

  saveDraftButton.addEventListener(
    "click",
    () => saveLog(false)
  );

  submitLogButton.addEventListener(
    "click",
    () => saveLog(true)
  );

  cancelButton.addEventListener(
    "click",
    () => {
      if (
        currentPractice?.id
      ) {
        window.location.href =
          `./practice.html?id=${encodeURIComponent(
            currentPractice.id
          )}`;
      } else {
        window.location.href =
          "./practices.html";
      }
    }
  );

  window.addEventListener(
    "beforeunload",
    () => {
      saveToLocalStorage();
    }
  );
}


/* =========================================================
   COLLECT FORM DATA
   ========================================================= */

function collectFormData() {
  const workTypes =
    getSelectedWorkAreas();

  return {
    workTypes,

    details: {
      programming: {
        activity:
          getValue(
            "programming-activity"
          ),

        tools:
          getValue(
            "programming-tools"
          ),

        result:
          getValue(
            "programming-result"
          ),

        bug:
          getValue(
            "programming-bug"
          ),

        solution:
          getValue(
            "programming-solution"
          )
      },

      cad: {
        project:
          getValue(
            "cad-project"
          ),

        activity:
          getValue(
            "cad-activity"
          ),

        reason:
          getValue(
            "cad-reason"
          ),

        result:
          getValue(
            "cad-result"
          )
      },

      mechanical: {
        activity:
          getValue(
            "mechanical-activity"
          ),

        result:
          getValue(
            "mechanical-result"
          ),

        next:
          getValue(
            "mechanical-next"
          )
      },

      electrical: {
        activity:
          getValue(
            "electrical-activity"
          ),

        problem:
          getValue(
            "electrical-problem"
          ),

        result:
          getValue(
            "electrical-result"
          )
      },

      autonomous: {
        activity:
          getValue(
            "autonomous-activity"
          ),

        tool:
          getValue(
            "autonomous-tool"
          ),

        result:
          getValue(
            "autonomous-result"
          ),

        problem:
          getValue(
            "autonomous-problem"
          )
      },

      teleop: {
        activity:
          getValue(
            "teleop-activity"
          ),

        result:
          getValue(
            "teleop-result"
          )
      },

      vision: {
        activity:
          getValue(
            "vision-activity"
          ),

        result:
          getValue(
            "vision-result"
          )
      },

      testing: {
        activity:
          getValue(
            "testing-activity"
          ),

        trials:
          getValue(
            "testing-trials"
          ),

        result:
          getValue(
            "testing-result"
          ),

        conclusion:
          getValue(
            "testing-conclusion"
          )
      },

      strategy: {
        activity:
          getValue(
            "strategy-activity"
          ),

        decision:
          getValue(
            "strategy-decision"
          )
      },

      outreach: {
        contactCount:
          getValue(
            "outreach-contact-count"
          ),

        contacted:
          getValue(
            "outreach-contacted"
          ),

        activity:
          getValue(
            "outreach-activity"
          ),

        result:
          getValue(
            "outreach-result"
          )
      },

      sponsorship: {
        count:
          getValue(
            "sponsorship-count"
          ),

        contacted:
          getValue(
            "sponsorship-contacted"
          ),

        activity:
          getValue(
            "sponsorship-activity"
          ),

        result:
          getValue(
            "sponsorship-result"
          )
      },

      manufacturing: {
        activity:
          getValue(
            "manufacturing-activity"
          ),

        result:
          getValue(
            "manufacturing-result"
          )
      }
    },

    overallSummary:
      getValue(
        "overall-summary"
      ),

    lesson:
      getValue(
        "main-lesson"
      ),

    nextStep:
      getValue(
        "main-next-step"
      )
  };
}


/* =========================================================
   SAVE
   ========================================================= */

async function saveLog(
  submit = false
) {
  const formData =
    collectFormData();

  if (
    formData.workTypes.length ===
    0
  ) {
    showToast(
      "Select at least one work area.",
      "warning"
    );

    document
      .getElementById(
        "area-selection-help"
      )
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

    return;
  }

  if (
    submit &&
    !validateForSubmission(
      formData
    )
  ) {
    return;
  }

  if (!currentUser) {
    showToast(
      "You are not signed in.",
      "error"
    );

    return;
  }

  if (!currentPractice) {
    showToast(
      "No practice is loaded.",
      "error"
    );

    return;
  }

  setButtonLoading(
    submit
      ? submitLogButton
      : saveDraftButton,
    true,
    submit
      ? "Submitting…"
      : "Saving…"
  );

  try {
    const logReference =
      doc(
        db,
        "seasons",
        SEASON_ID,
        "practices",
        currentPractice.id,
        "logs",
        currentUser.uid
      );

    const existingData =
      currentLog || {};

    const logData = {
      userId:
        currentUser.uid,

      memberName:
        currentUser.displayName ||
        currentUser.email?.split("@")[0] ||
        "Team Member",

      memberEmail:
        currentUser.email || "",

      seasonId:
        SEASON_ID,

      practiceId:
        currentPractice.id,

      workTypes:
        formData.workTypes,

      details:
        formData.details,

      overallSummary:
        formData.overallSummary,

      lesson:
        formData.lesson,

      nextStep:
        formData.nextStep,

      status:
        submit
          ? "submitted"
          : "draft",

      updatedAt:
        serverTimestamp(),

      submittedAt:
        submit
          ? serverTimestamp()
          : (
              existingData.submittedAt ||
              null
            ),

      createdAt:
        existingData.createdAt ||
        serverTimestamp()
    };

    await setDoc(
      logReference,
      logData,
      {
        merge: true
      }
    );

    currentLog = {
      id: currentUser.uid,
      ...logData
    };

    isSubmitted =
      submit;

    clearLocalDraft();

    await refreshPracticeSubmissionCount();

    if (submit) {
      updateSaveState(
        "submitted"
      );

      showToast(
        "Your practice log has been submitted.",
        "success"
      );

      setTimeout(
        () => {
          window.location.href =
            `./practice.html?id=${encodeURIComponent(
              currentPractice.id
            )}`;
        },
        700
      );
    } else {
      updateSaveState(
        "saved"
      );

      showToast(
        "Draft saved.",
        "success"
      );
    }

  } catch (error) {
    console.error(
      "Failed to save practice log:",
      error
    );

    saveToLocalStorage();

    showToast(
      "Unable to save to Firebase. Your latest work was saved locally.",
      "error"
    );
  } finally {
    setButtonLoading(
      submit
        ? submitLogButton
        : saveDraftButton,
      false,
      submit
        ? "Submit Log"
        : "Save Draft"
    );
  }
}


/* =========================================================
   VALIDATION
   ========================================================= */

function validateForSubmission(
  data
) {
  const errors = [];

  if (
    !data.overallSummary
  ) {
    errors.push(
      "Add your main accomplishment."
    );
  }

  if (
    !data.lesson
  ) {
    errors.push(
      "Record at least one lesson learned."
    );
  }

  if (
    !data.nextStep
  ) {
    errors.push(
      "Add a next step."
    );
  }

  const detailCount =
    countMeaningfulDetails(
      data.details
    );

  if (detailCount === 0) {
    errors.push(
      "Add specific details about the work you completed."
    );
  }

  if (errors.length) {
    showToast(
      errors[0],
      "warning"
    );

    return false;
  }

  return true;
}


/* =========================================================
   UPDATE PRACTICE COUNT
   ========================================================= */

async function refreshPracticeSubmissionCount() {
  if (!currentPractice?.id) {
    return;
  }

  const logsReference =
    collection(
      db,
      "seasons",
      SEASON_ID,
      "practices",
      currentPractice.id,
      "logs"
    );

  const snapshot =
    await getDocs(
      logsReference
    );

  const submittedLogs =
    snapshot.docs.filter(
      (document) =>
        document.data().status ===
        "submitted"
    );

  const practiceReference =
    doc(
      db,
      "seasons",
      SEASON_ID,
      "practices",
      currentPractice.id
    );

  await updateDoc(
    practiceReference,
    {
      submittedCount:
        submittedLogs.length,
      updatedAt:
        serverTimestamp()
    }
  );
}


/* =========================================================
   LOCAL DRAFT
   ========================================================= */

function scheduleAutosave() {
  if (!localDraftKey) {
    return;
  }

  window.clearTimeout(
    autosaveTimer
  );

  autosaveTimer =
    window.setTimeout(
      () => {
        saveToLocalStorage();
      },
      700
    );
}

function saveToLocalStorage() {
  if (!localDraftKey) {
    return;
  }

  try {
    const data =
      collectFormData();

    localStorage.setItem(
      localDraftKey,
      JSON.stringify({
        savedAt:
          Date.now(),
        data
      })
    );
  } catch (error) {
    console.warn(
      "Unable to save local draft:",
      error
    );
  }
}

function restoreLocalDraftIfUseful() {
  if (!localDraftKey) {
    return;
  }

  try {
    const raw =
      localStorage.getItem(
        localDraftKey
      );

    if (!raw) {
      return;
    }

    const stored =
      JSON.parse(raw);

    if (
      !stored?.data
    ) {
      return;
    }

    /*
     * If there is already a submitted
     * Firebase record, do not silently
     * overwrite it with an old browser draft.
     */
    if (
      isSubmitted
    ) {
      return;
    }

    populateForm(
      stored.data
    );
  } catch (error) {
    console.warn(
      "Unable to restore local draft:",
      error
    );
  }
}

function clearLocalDraft() {
  if (!localDraftKey) {
    return;
  }

  try {
    localStorage.removeItem(
      localDraftKey
    );
  } catch (error) {
    console.warn(
      "Unable to clear local draft:",
      error
    );
  }
}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary() {
  const data =
    collectFormData();

  const areaCount =
    data.workTypes.length;

  const presetCount =
    document.querySelectorAll(
      ".preset-button.selected"
    ).length;

  summaryAreaCount.textContent =
    areaCount;

  summaryPresetCount.textContent =
    presetCount;

  summaryAccomplishmentStatus.textContent =
    data.overallSummary
      ? "Added"
      : "Missing";

  summaryLessonStatus.textContent =
    data.lesson
      ? "Added"
      : "Missing";

  summaryNextStatus.textContent =
    data.nextStep
      ? "Added"
      : "Missing";

  if (
    data.overallSummary &&
    data.lesson &&
    data.nextStep
  ) {
    saveStatusDetail.textContent =
      "Your core reflection is complete.";
  } else {
    saveStatusDetail.textContent =
      "Your work is still being documented.";
  }
}


/* =========================================================
   SAVE STATE
   ========================================================= */

function updateSaveState(
  state = "draft"
) {
  if (
    state === "submitted"
  ) {
    saveStatusTitle.textContent =
      "Submitted";

    saveStatusDetail.textContent =
      "Your documentation has been submitted for this practice.";

    submitLogButton.disabled =
      true;

    saveDraftButton.disabled =
      true;

    return;
  }

  if (
    state === "saved"
  ) {
    saveStatusTitle.textContent =
      "Draft saved";

    saveStatusDetail.textContent =
      `Last saved ${new Date().toLocaleTimeString(
        [],
        {
          hour: "numeric",
          minute: "2-digit"
        }
      )}`;

    return;
  }

  if (isSubmitted) {
    saveStatusTitle.textContent =
      "Submitted";

    saveStatusDetail.textContent =
      "Your documentation has already been submitted.";

    return;
  }

  saveStatusTitle.textContent =
    "Draft";

  saveStatusDetail.textContent =
    "Your work has not been submitted yet.";
}


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function getValue(id) {
  const element =
    document.getElementById(
      id
    );

  return element
    ? element.value.trim()
    : "";
}

function setValue(
  id,
  value
) {
  const element =
    document.getElementById(
      id
    );

  if (
    element &&
    value !== null &&
    value !== undefined
  ) {
    element.value = String(
      value
    );
  }
}

function countMeaningfulDetails(
  details
) {
  let count = 0;

  Object.values(
    details || {}
  ).forEach(
    (area) => {
      if (
        !area ||
        typeof area !==
          "object"
      ) {
        return;
      }

      Object.values(area)
        .forEach(
          (value) => {
            if (
              String(
                value || ""
              ).trim()
            ) {
              count++;
            }
          }
        );
    }
  );

  return count;
}

function collectAllMeaningfulText(
  data
) {
  const values = [];

  function collect(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return;
    }

    if (
      typeof value ===
      "object"
    ) {
      Object.values(value)
        .forEach(
          collect
        );

      return;
    }

    const text =
      String(value)
        .trim();

    if (text) {
      values.push(text);
    }
  }

  collect(data);

  return values;
}


/* =========================================================
   DATE
   ========================================================= */

function formatPracticeDate(
  value
) {
  if (!value) {
    return "Practice date unavailable";
  }

  let date;

  if (
    typeof value ===
      "object" &&
    typeof value.toDate ===
      "function"
  ) {
    date =
      value.toDate();
  } else if (
    value instanceof Date
  ) {
    date = value;
  } else {
    date =
      new Date(value);
  }

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Practice date unavailable";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }
  ).format(date);
}


/* =========================================================
   VISIBILITY
   ========================================================= */

function hideLoading() {
  loadingElement.classList.add(
    "hidden"
  );

  errorElement.classList.add(
    "hidden"
  );

  contentElement.classList.remove(
    "hidden"
  );
}

function showError(
  message
) {
  loadingElement.classList.add(
    "hidden"
  );

  contentElement.classList.add(
    "hidden"
  );

  errorElement.classList.remove(
    "hidden"
  );

  errorMessageElement.textContent =
    message;
}