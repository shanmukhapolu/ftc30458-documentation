// public/js/practice.js

import {
  db,
  auth
} from "./firebase.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  formatDate,
  formatDateTime,
  initials,
  showToast
} from "./ui.js";

const SEASON_ID = "2026-27";

let currentUser = null;
let currentPractice = null;
let memberLogs = [];


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const loadingState =
  document.getElementById(
    "practice-loading"
  );

const practiceContent =
  document.getElementById(
    "practice-content"
  );

const errorState =
  document.getElementById(
    "practice-error"
  );

const errorMessage =
  document.getElementById(
    "practice-error-message"
  );

const practiceTitle =
  document.getElementById(
    "practice-title"
  );

const practiceDate =
  document.getElementById(
    "practice-date"
  );

const practiceNumber =
  document.getElementById(
    "practice-number"
  );

const practiceStatus =
  document.getElementById(
    "practice-status"
  );

const createdByLabel =
  document.getElementById(
    "created-by-label"
  );

const practiceObjective =
  document.getElementById(
    "practice-objective"
  );

const practiceSummary =
  document.getElementById(
    "practice-summary"
  );

const submittedCount =
  document.getElementById(
    "submitted-count"
  );

const documentationProgress =
  document.getElementById(
    "documentation-progress"
  );

const documentationStatus =
  document.getElementById(
    "documentation-status"
  );

const evidenceCount =
  document.getElementById(
    "evidence-count"
  );

const accomplishmentsContainer =
  document.getElementById(
    "accomplishments-container"
  );

const yourLogTitle =
  document.getElementById(
    "your-log-title"
  );

const yourLogDescription =
  document.getElementById(
    "your-log-description"
  );

const memberDocumentation =
  document.getElementById(
    "member-documentation"
  );

const memberCountLabel =
  document.getElementById(
    "member-count-label"
  );

const myLogButtons = [
  document.getElementById(
    "my-log-button"
  ),
  document.getElementById(
    "open-log-button"
  )
].filter(Boolean);

const evidenceButton =
  document.getElementById(
    "portfolio-evidence-button"
  );


/* =========================================================
   LOAD PRACTICE PAGE
   ========================================================= */

/**
 * Load a practice page.
 *
 * @param {import("firebase/auth").User} user
 */
export async function loadPracticePage(user) {
  currentUser = user;

  const params =
    new URLSearchParams(
      window.location.search
    );

  const practiceId =
    params.get("id");

  if (!practiceId) {
    showError(
      "No practice was specified."
    );

    return;
  }

  try {
    const practiceReference =
      doc(
        db,
        "seasons",
        SEASON_ID,
        "practices",
        practiceId
      );

    const practiceSnapshot =
      await getDoc(
        practiceReference
      );

    if (!practiceSnapshot.exists()) {
      showError(
        "This practice does not exist or is no longer available."
      );

      return;
    }

    currentPractice = {
      id: practiceSnapshot.id,
      ...practiceSnapshot.data()
    };

    await loadMemberLogs(
      practiceId
    );

    renderPractice();
    renderMemberDocumentation();
    renderYourLog();
    renderDocumentationProgress();
    renderAccomplishments();

    hideLoading();
  } catch (error) {
    console.error(
      "Failed to load practice:",
      error
    );

    showError(
      "Unable to load this practice. Please try again."
    );

    showToast(
      "Unable to load practice.",
      "error"
    );
  }
}


/* =========================================================
   LOAD MEMBER LOGS
   ========================================================= */

async function loadMemberLogs(
  practiceId
) {
  const logsReference =
    collection(
      db,
      "seasons",
      SEASON_ID,
      "practices",
      practiceId,
      "logs"
    );

  let snapshot;

  try {
    const logsQuery =
      query(
        logsReference,
        orderBy("submittedAt", "asc")
      );

    snapshot =
      await getDocs(logsQuery);
  } catch (error) {
    /*
     * We intentionally fall back to a
     * plain collection read. This makes the
     * application tolerant of logs that do
     * not yet contain submittedAt.
     */
    console.warn(
      "Ordered log query failed; using basic query.",
      error
    );

    snapshot =
      await getDocs(
        logsReference
      );
  }

  memberLogs =
    snapshot.docs.map(
      (document) => ({
        id: document.id,
        ...document.data()
      })
    );
}


/* =========================================================
   RENDER PRACTICE INFORMATION
   ========================================================= */

function renderPractice() {
  const number =
    currentPractice.practiceNumber;

  practiceTitle.textContent =
    currentPractice.title ||
    `Practice #${number}`;

  practiceDate.textContent =
    formatDate(
      currentPractice.date ||
      currentPractice.createdAt
    );

  practiceNumber.textContent =
    `Practice #${number}`;

  const status =
    currentPractice.status ||
    "in-progress";

  practiceStatus.textContent =
    getStatusLabel(status);

  practiceStatus.className =
    `chip ${getStatusChipClass(
      status
    )}`;

  createdByLabel.textContent =
    currentPractice.createdByEmail
      ? `Started by ${currentPractice.createdByEmail}`
      : "Practice record";

  practiceObjective.textContent =
    currentPractice.objective?.trim() ||
    "No objective has been recorded yet.";

  practiceSummary.textContent =
    currentPractice.summary?.trim() ||
    "No summary has been recorded yet.";
}


/* =========================================================
   RENDER DOCUMENTATION PROGRESS
   ========================================================= */

function renderDocumentationProgress() {
  const submitted =
    memberLogs.length;

  /*
   * Eventually memberCount will come from
   * the team's active member roster.
   *
   * For the moment, use the practice's
   * stored count when available.
   */
  const configuredMemberCount =
    Number(
      currentPractice.memberCount || 0
    );

  const totalMembers =
    configuredMemberCount > 0
      ? configuredMemberCount
      : submitted;

  const completion =
    totalMembers > 0
      ? Math.min(
          100,
          Math.round(
            (submitted /
              totalMembers) *
              100
          )
        )
      : 0;

  submittedCount.textContent =
    `${submitted} / ${totalMembers}`;

  documentationProgress.style.width =
    `${completion}%`;

  documentationStatus.textContent =
    getStatusLabel(
      currentPractice.status ||
        "in-progress"
    );

  const evidenceItems =
    countEvidenceItems();

  evidenceCount.textContent =
    `${evidenceItems} ${
      evidenceItems === 1
        ? "item"
        : "items"
    }`;

  memberCountLabel.textContent =
    `${totalMembers} ${
      totalMembers === 1
        ? "member"
        : "members"
    }`;
}


/* =========================================================
   RENDER ACCOMPLISHMENTS
   ========================================================= */

function renderAccomplishments() {
  const accomplishments =
    Array.isArray(
      currentPractice.majorAccomplishments
    )
      ? currentPractice.majorAccomplishments
      : [];

  if (!accomplishments.length) {
    accomplishmentsContainer.innerHTML = `
      <p class="summary-placeholder">
        No accomplishments have been recorded yet.
        These will eventually be captured as the team
        closes out the practice.
      </p>
    `;

    return;
  }

  accomplishmentsContainer.innerHTML = `
    <ul class="summary-list">
      ${accomplishments
        .map(
          (item) => `
            <li>
              ${escapeHtml(item)}
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}


/* =========================================================
   RENDER CURRENT USER'S LOG
   ========================================================= */

function renderYourLog() {
  if (!currentUser) {
    return;
  }

  const myLog =
    memberLogs.find(
      (log) =>
        log.id === currentUser.uid ||
        log.userId === currentUser.uid
    );

  if (!myLog) {
    yourLogTitle.textContent =
      "Your log has not been submitted";

    yourLogDescription.textContent =
      "Document what you worked on, what changed, what you learned, and what should happen next.";

    return;
  }

  yourLogTitle.textContent =
    "Your log has been submitted";

  const submittedText =
    myLog.submittedAt
      ? formatDateTime(
          myLog.submittedAt
        )
      : "Saved";

  const workTypes =
    Array.isArray(
      myLog.workTypes
    )
      ? myLog.workTypes
      : [];

  const workText =
    workTypes.length
      ? workTypes.join(", ")
      : "Work documented";

  yourLogDescription.textContent =
    `${workText} · ${submittedText}`;
}


/* =========================================================
   RENDER MEMBER DOCUMENTATION
   ========================================================= */

function renderMemberDocumentation() {
  if (!memberLogs.length) {
    memberDocumentation.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-icon">
            ✎
          </div>

          <h3>
            No member logs yet
          </h3>

          <p>
            Team members' documentation will appear here
            after they submit their practice logs.
          </p>
        </div>
      </div>
    `;

    return;
  }

  memberDocumentation.innerHTML =
    memberLogs
      .map(
        (log) =>
          createMemberLogCard(log)
      )
      .join("");

  initializeMemberLogCards();
}


/* =========================================================
   MEMBER LOG CARD
   ========================================================= */

function createMemberLogCard(log) {
  const name =
    log.memberName ||
    log.displayName ||
    log.userName ||
    log.memberEmail?.split("@")[0] ||
    "Team Member";

  const role =
    log.primaryRole ||
    log.role ||
    getRoleSummary(log);

  const initialsText =
    initials(name);

  const workTypes =
    Array.isArray(
      log.workTypes
    )
      ? log.workTypes
      : [];

  const evidence =
    countLogEvidence(log);

  const submittedText =
    log.submittedAt
      ? `Submitted ${formatRelativeOrAbsolute(
          log.submittedAt
        )}`
      : "Submitted";

  const summary =
    log.summary ||
    log.description ||
    "";

  return `
    <article
      class="member-doc"
      data-log-id="${escapeHtml(
        log.id
      )}"
    >

      <button
        type="button"
        class="member-doc-summary"
        aria-expanded="false"
      >

        <div class="member-doc-avatar">
          ${escapeHtml(
            initialsText
          )}
        </div>

        <div class="member-doc-main">

          <span class="member-doc-name">
            ${escapeHtml(name)}
          </span>

          <span class="member-doc-role">
            ${escapeHtml(
              role || "Team member"
            )}
          </span>

        </div>

        <div class="member-doc-status">
          <span class="chip chip-success">
            Submitted
          </span>
        </div>

        <div
          class="member-doc-chevron"
          aria-hidden="true"
        >
          ↓
        </div>

      </button>

      <div class="member-doc-details">

        <div
          class="stack"
          style="padding-top: 15px;"
        >

          <div>
            <div class="overview-label">
              Work areas
            </div>

            ${
              workTypes.length
                ? `
                  <div
                    class="row wrap"
                    style="gap: 6px;"
                  >
                    ${workTypes
                      .map(
                        (type) => `
                          <span class="chip chip-accent">
                            ${escapeHtml(
                              type
                            )}
                          </span>
                        `
                      )
                      .join("")}
                  </div>
                `
                : `
                  <div class="muted tiny">
                    No work areas recorded.
                  </div>
                `
            }
          </div>

          <div>
            <div class="overview-label">
              Summary
            </div>

            <p class="overview-value">
              ${
                summary
                  ? escapeHtml(
                      summary
                    )
                  : "No summary recorded."
              }
            </p>
          </div>

          <div>
            <div class="overview-label">
              Evidence
            </div>

            <p class="overview-value">
              ${evidence}
              ${
                evidence === 1
                  ? "item"
                  : "items"
              } attached
            </p>
          </div>

          <div class="muted tiny">
            ${escapeHtml(
              submittedText
            )}
          </div>

        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   MEMBER CARD INTERACTIONS
   ========================================================= */

function initializeMemberLogCards() {
  const cards =
    memberDocumentation.querySelectorAll(
      ".member-doc"
    );

  cards.forEach((card) => {
    const trigger =
      card.querySelector(
        ".member-doc-summary"
      );

    if (!trigger) {
      return;
    }

    trigger.addEventListener(
      "click",
      () => {
        const expanded =
          card.classList.toggle(
            "expanded"
          );

        trigger.setAttribute(
          "aria-expanded",
          String(expanded)
        );
      }
    );
  });
}


/* =========================================================
   EVIDENCE COUNTING
   ========================================================= */

function countEvidenceItems() {
  return memberLogs.reduce(
    (total, log) =>
      total +
      countLogEvidence(log),
    0
  );
}

function countLogEvidence(log) {
  let count = 0;

  if (
    Array.isArray(
      log.evidence
    )
  ) {
    count +=
      log.evidence.length;
  }

  if (
    Array.isArray(
      log.attachments
    )
  ) {
    count +=
      log.attachments.length;
  }

  if (
    Array.isArray(
      log.photos
    )
  ) {
    count +=
      log.photos.length;
  }

  if (
    Array.isArray(
      log.videos
    )
  ) {
    count +=
      log.videos.length;
  }

  return count;
}


/* =========================================================
   ROLE SUMMARY
   ========================================================= */

function getRoleSummary(log) {
  const roles = [];

  if (log.primaryRole) {
    roles.push(
      log.primaryRole
    );
  }

  if (
    Array.isArray(
      log.workTypes
    )
  ) {
    roles.push(
      ...log.workTypes
    );
  }

  return [
    ...new Set(roles)
  ].join(" · ");
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function openMyLog() {
  if (!currentPractice?.id) {
    return;
  }

  window.location.href =
    `./my-log.html?practiceId=${encodeURIComponent(
      currentPractice.id
    )}`;
}

function openEvidence() {
  if (!currentPractice?.id) {
    return;
  }

  window.location.href =
    `./evidence.html?practiceId=${encodeURIComponent(
      currentPractice.id
    )}`;
}

myLogButtons.forEach(
  (button) => {
    button.addEventListener(
      "click",
      openMyLog
    );
  }
);

evidenceButton?.addEventListener(
  "click",
  openEvidence
);


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
   DATE HELPERS
   ========================================================= */

function formatRelativeOrAbsolute(
  value
) {
  if (!value) {
    return "just now";
  }

  let date;

  if (
    typeof value === "object" &&
    typeof value.toDate ===
      "function"
  ) {
    date = value.toDate();
  } else if (
    value instanceof Date
  ) {
    date = value;
  } else {
    date = new Date(value);
  }

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "recently";
  }

  const age =
    Date.now() -
    date.getTime();

  const minutes =
    Math.floor(
      age / 60000
    );

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return formatDate(
    date
  );
}


/* =========================================================
   ERROR / VISIBILITY
   ========================================================= */

function hideLoading() {
  loadingState.classList.add(
    "hidden"
  );

  practiceContent.classList.remove(
    "hidden"
  );

  errorState.classList.add(
    "hidden"
  );
}

function showError(message) {
  loadingState.classList.add(
    "hidden"
  );

  practiceContent.classList.add(
    "hidden"
  );

  errorState.classList.remove(
    "hidden"
  );

  errorMessage.textContent =
    message;
}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHtml(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}