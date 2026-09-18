// public/js/practices.js

import {
  auth,
  db
} from "./firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  showToast,
  formatDate,
  setButtonLoading
} from "./ui.js";

const SEASON_ID = "2026-27";

const practicesCollection = collection(
  db,
  "seasons",
  SEASON_ID,
  "practices"
);

let allPractices = [];
let currentUser = null;


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const totalPracticesElement =
  document.getElementById("total-practices");

const completedPracticesElement =
  document.getElementById("completed-practices");

const currentPracticeNumberElement =
  document.getElementById("current-practice-number");

const latestLogStatusElement =
  document.getElementById("latest-log-status");

const currentPracticeContainer =
  document.getElementById(
    "current-practice-container"
  );

const currentPracticeSection =
  document.getElementById(
    "current-practice-section"
  );

const practiceList =
  document.getElementById("practice-list");

const practiceCountLabel =
  document.getElementById(
    "practice-count-label"
  );

const searchInput =
  document.getElementById(
    "practice-search"
  );

const statusFilter =
  document.getElementById(
    "practice-status-filter"
  );

const startPracticeButton =
  document.getElementById(
    "start-practice-button"
  );


/* =========================================================
   AUTH INITIALIZATION
   ========================================================= */

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    return;
  }

  currentUser = user;

  await loadPractices();
});


/* =========================================================
   LOAD PRACTICES
   ========================================================= */

async function loadPractices() {
  renderLoadingState();

  try {
    const practicesQuery = query(
      practicesCollection,
      orderBy("practiceNumber", "desc")
    );

    const snapshot =
      await getDocs(practicesQuery);

    allPractices = snapshot.docs.map(
      (document) => ({
        id: document.id,
        ...document.data()
      })
    );

    updateSummary();
    renderCurrentPractice();
    renderPracticeHistory();

  } catch (error) {
    console.error(
      "Failed to load practices:",
      error
    );

    renderErrorState(
      "Unable to load practices. Check your Firebase configuration and Firestore rules."
    );

    showToast(
      "Unable to load practices.",
      "error"
    );
  }
}


/* =========================================================
   FIND CURRENT PRACTICE
   ========================================================= */

function getCurrentPractice() {
  return (
    allPractices.find(
      (practice) =>
        practice.status === "in-progress" ||
        practice.status === "ready"
    ) || null
  );
}


/* =========================================================
   START NEW PRACTICE
   ========================================================= */

async function startNewPractice() {
  if (!currentUser) {
    showToast(
      "You must be signed in to start a practice.",
      "error"
    );

    return;
  }

  const existingPractice =
    getCurrentPractice();

  if (existingPractice) {
    openPractice(existingPractice);

    showToast(
      `Practice #${existingPractice.practiceNumber} is already in progress.`,
      "info"
    );

    return;
  }

  setButtonLoading(
    startPracticeButton,
    true,
    "Starting…"
  );

  try {
    const nextPracticeNumber =
      getNextPracticeNumber();

    const practice = {
      seasonId: SEASON_ID,

      practiceNumber:
        nextPracticeNumber,

      title:
        `Practice #${nextPracticeNumber}`,

      date: new Date(),

      status: "in-progress",

      createdBy:
        currentUser.uid,

      createdByEmail:
        currentUser.email || "",

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp(),

      // These will become populated as
      // team members submit their logs.
      memberCount: 0,

      submittedCount: 0,

      // Team-level information will be
      // added during practice completion.
      objective: "",

      summary: "",

      majorAccomplishments: [],

      majorProblems: [],

      nextSteps: []
    };

    const documentReference =
      await addDoc(
        practicesCollection,
        practice
      );

    const newPractice = {
      id: documentReference.id,
      ...practice
    };

    allPractices.unshift(
      newPractice
    );

    updateSummary();
    renderCurrentPractice();
    renderPracticeHistory();

    showToast(
      `Practice #${nextPracticeNumber} started.`,
      "success"
    );

    openPractice(newPractice);

  } catch (error) {
    console.error(
      "Failed to start practice:",
      error
    );

    showToast(
      "Unable to start the practice.",
      "error"
    );
  } finally {
    setButtonLoading(
      startPracticeButton,
      false
    );
  }
}


/* =========================================================
   NEXT PRACTICE NUMBER
   ========================================================= */

function getNextPracticeNumber() {
  if (!allPractices.length) {
    return 1;
  }

  return (
    Math.max(
      ...allPractices.map(
        (practice) =>
          Number(
            practice.practiceNumber
          ) || 0
      )
    ) + 1
  );
}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary() {
  const completed =
    allPractices.filter(
      (practice) =>
        practice.status === "closed"
    ).length;

  const currentPractice =
    getCurrentPractice();

  totalPracticesElement.textContent =
    allPractices.length;

  completedPracticesElement.textContent =
    completed;

  currentPracticeNumberElement.textContent =
    currentPractice
      ? `#${currentPractice.practiceNumber}`
      : "—";

  /*
   * We haven't built the user-log system yet,
   * so this will be replaced by a real lookup
   * later.
   */
  latestLogStatusElement.textContent =
    currentPractice
      ? "Pending"
      : "—";
}


/* =========================================================
   CURRENT PRACTICE
   ========================================================= */

function renderCurrentPractice() {
  const practice =
    getCurrentPractice();

  if (!practice) {
    currentPracticeSection.classList.add(
      "hidden"
    );

    return;
  }

  currentPracticeSection.classList.remove(
    "hidden"
  );

  currentPracticeContainer.innerHTML =
    createPracticeCard(
      practice,
      true
    );

  attachPracticeCardListeners(
    currentPracticeContainer
  );
}


/* =========================================================
   PRACTICE HISTORY
   ========================================================= */

function renderPracticeHistory() {
  const searchTerm =
    searchInput.value
      .trim()
      .toLowerCase();

  const selectedStatus =
    statusFilter.value;

  const filtered =
    allPractices.filter(
      (practice) => {
        const matchesSearch =
          !searchTerm ||
          String(
            practice.practiceNumber
          )
            .toLowerCase()
            .includes(searchTerm) ||
          String(
            practice.title || ""
          )
            .toLowerCase()
            .includes(searchTerm) ||
          String(
            practice.summary || ""
          )
            .toLowerCase()
            .includes(searchTerm);

        const matchesStatus =
          selectedStatus === "all" ||
          practice.status ===
            selectedStatus;

        return (
          matchesSearch &&
          matchesStatus
        );
      }
    );

  /*
   * Do not display the current practice
   * twice. It already has its own section.
   */
  const current =
    getCurrentPractice();

  const history =
    filtered.filter(
      (practice) =>
        !current ||
        practice.id !== current.id
    );

  practiceCountLabel.textContent =
    `${history.length} ${
      history.length === 1
        ? "practice"
        : "practices"
    }`;

  if (!history.length) {
    practiceList.innerHTML = `
      <div class="card empty-practices">
        <div class="empty-state">
          <div class="empty-icon">▣</div>

          <h3>No practices found</h3>

          <p>
            ${
              allPractices.length
                ? "Try changing your search or status filter."
                : "Your first practice will appear here once it has been started."
            }
          </p>
        </div>
      </div>
    `;

    return;
  }

  practiceList.innerHTML =
    history
      .map(
        (practice) =>
          createPracticeCard(
            practice,
            false
          )
      )
      .join("");

  attachPracticeCardListeners(
    practiceList
  );
}


/* =========================================================
   PRACTICE CARD
   ========================================================= */

function createPracticeCard(
  practice,
  isCurrent = false
) {
  const status =
    practice.status ||
    "in-progress";

  const statusLabel =
    getStatusLabel(status);

  const statusClass =
    getStatusChipClass(status);

  const submitted =
    Number(
      practice.submittedCount || 0
    );

  const members =
    Number(
      practice.memberCount || 0
    );

  const completion =
    members > 0
      ? Math.round(
          (submitted / members) *
            100
        )
      : 0;

  const date = formatDate(
    practice.date ||
      practice.createdAt
  );

  const description =
    practice.summary ||
    practice.objective ||
    "No practice summary has been added yet.";

  const classes = [
    "practice-row"
  ];

  if (isCurrent) {
    classes.push(
      "current-practice"
    );
  }

  return `
    <article
      class="${classes.join(" ")}"
      data-practice-id="${escapeHtml(
        practice.id
      )}"
      tabindex="0"
      role="button"
      aria-label="Open Practice #${escapeHtml(
        practice.practiceNumber
      )}"
    >

      <div class="practice-number">
        <strong>
          #${escapeHtml(
            practice.practiceNumber
          )}
        </strong>

        <span>
          ${escapeHtml(date)}
        </span>
      </div>

      <div class="practice-main">

        <div class="practice-title-row">
          <h3 class="practice-title">
            ${escapeHtml(
              practice.title ||
                `Practice #${practice.practiceNumber}`
            )}
          </h3>

          <span
            class="chip ${statusClass}"
          >
            ${escapeHtml(
              statusLabel
            )}
          </span>
        </div>

        <p class="practice-description">
          ${escapeHtml(
            description
          )}
        </p>

        <div class="practice-meta">

          <span class="practice-meta-item">
            ${members || "—"} members
          </span>

          <span>•</span>

          <span class="practice-meta-item">
            ${submitted || 0} logs submitted
          </span>

          ${
            practice.majorAccomplishments?.length
              ? `
                <span>•</span>
                <span class="practice-meta-item">
                  ${practice.majorAccomplishments.length}
                  accomplishments
                </span>
              `
              : ""
          }

        </div>
      </div>

      <div class="practice-side">

        <div class="completion">
          ${
            members > 0
              ? `${submitted}/${members} logs`
              : "No logs yet"
          }
        </div>

        <div class="completion-bar">
          <span
            style="width: ${completion}%"
          ></span>
        </div>

        <span
          class="practice-status-chip chip ${statusClass}"
        >
          ${escapeHtml(statusLabel)}
        </span>

      </div>

    </article>
  `;
}


/* =========================================================
   STATUS HELPERS
   ========================================================= */

function getStatusLabel(status) {
  switch (status) {
    case "in-progress":
      return "In progress";

    case "ready":
      return "Ready to close";

    case "closed":
      return "Closed";

    default:
      return "Unknown";
  }
}

function getStatusChipClass(status) {
  switch (status) {
    case "in-progress":
      return "chip-accent";

    case "ready":
      return "chip-warning";

    case "closed":
      return "chip-success";

    default:
      return "chip-neutral";
  }
}


/* =========================================================
   OPEN PRACTICE
   ========================================================= */

function openPractice(practice) {
  if (!practice?.id) {
    return;
  }

  window.location.href =
    `./practice.html?id=${encodeURIComponent(
      practice.id
    )}`;
}


/* =========================================================
   CARD EVENTS
   ========================================================= */

function attachPracticeCardListeners(
  container
) {
  const cards =
    container.querySelectorAll(
      "[data-practice-id]"
    );

  cards.forEach((card) => {
    const practiceId =
      card.dataset.practiceId;

    const practice =
      allPractices.find(
        (item) =>
          item.id === practiceId
      );

    if (!practice) {
      return;
    }

    card.addEventListener(
      "click",
      () => {
        openPractice(practice);
      }
    );

    card.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          openPractice(practice);
        }
      }
    );
  });
}


/* =========================================================
   LOADING / ERROR STATES
   ========================================================= */

function renderLoadingState() {
  practiceList.innerHTML = `
    <div class="card">
      <div class="empty-state">
        <div class="loading">
          <div class="spinner"></div>
          Loading practices…
        </div>
      </div>
    </div>
  `;

  currentPracticeContainer.innerHTML =
    "";
}

function renderErrorState(message) {
  practiceList.innerHTML = `
    <div class="card">
      <div class="empty-state">
        <div class="empty-icon">!</div>

        <h3>
          Unable to load practices
        </h3>

        <p>
          ${escapeHtml(message)}
        </p>
      </div>
    </div>
  `;

  currentPracticeContainer.innerHTML =
    "";
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

startPracticeButton.addEventListener(
  "click",
  startNewPractice
);

searchInput.addEventListener(
  "input",
  renderPracticeHistory
);

statusFilter.addEventListener(
  "change",
  renderPracticeHistory
);