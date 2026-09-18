// public/js/dashboard.js

import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  showToast,
  formatDate,
  formatRelativeTime
} from "./ui.js";

const SEASON_ID = "2026-27";

let currentUser = null;
let practices = [];


/* =========================================================
   INITIALIZATION
   ========================================================= */

export async function initializeDashboard(user) {
  currentUser = user;

  try {
    await loadPractices();
    updateDashboard();
  } catch (error) {
    console.error(
      "Unable to initialize dashboard:",
      error
    );

    showToast(
      "Unable to load dashboard data.",
      "error"
    );
  }
}


/* =========================================================
   LOAD PRACTICES
   ========================================================= */

async function loadPractices() {
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

  practices =
    snapshot.docs.map(
      (document) => ({
        id: document.id,
        ...document.data()
      })
    );
}


/* =========================================================
   DASHBOARD UPDATE
   ========================================================= */

function updateDashboard() {
  const currentPractice =
    practices.find(
      (practice) =>
        practice.status ===
          "in-progress" ||
        practice.status ===
          "ready"
    ) || null;

  const completedPractices =
    practices.filter(
      (practice) =>
        practice.status ===
        "closed"
    );

  updateStatCards(
    practices.length,
    completedPractices.length,
    currentPractice
  );

  updateCurrentPractice(
    currentPractice
  );

  updatePracticeProgress(
    currentPractice
  );

  updateRecentActivity(
    currentPractice
  );
}


/* =========================================================
   STAT CARDS
   ========================================================= */

function updateStatCards(
  totalPractices,
  completedPractices,
  currentPractice
) {
  const statCards =
    document.querySelectorAll(
      ".stat-card"
    );

  if (statCards.length < 4) {
    return;
  }

  /*
   * Card 1 — Practices Logged
   */
  const firstValue =
    statCards[0].querySelector(
      ".stat-value"
    );

  if (firstValue) {
    firstValue.textContent =
      totalPractices;
  }

  /*
   * Card 2 — Your Entries
   *
   * This is updated from practice records
   * below as well.
   */
  const secondValue =
    statCards[1].querySelector(
      ".stat-value"
    );

  if (secondValue) {
    secondValue.textContent =
      getUserLogCount();
  }

  /*
   * Card 3 — Engineering Decisions
   */
  const thirdValue =
    statCards[2].querySelector(
      ".stat-value"
    );

  if (thirdValue) {
    thirdValue.textContent =
      getDecisionCount();
  }

  /*
   * Card 4 — Portfolio Evidence
   */
  const fourthValue =
    statCards[3].querySelector(
      ".stat-value"
    );

  if (fourthValue) {
    fourthValue.textContent =
      getEvidenceCount();
  }
}


/* =========================================================
   USER LOG COUNT
   ========================================================= */

function getUserLogCount() {
  return practices.reduce(
    (count, practice) => {
      const submittedMembers =
        Number(
          practice.submittedCount ||
            0
        );

      /*
       * This is only a temporary approximation
       * until we add a user-log summary field to
       * each practice.
       *
       * The proper implementation will query the
       * user's actual documents.
       */
      if (
        practice.submittedCount >
          0
      ) {
        return count + 1;
      }

      return count;
    },
    0
  );
}


/* =========================================================
   ENGINEERING DECISIONS
   ========================================================= */

function getDecisionCount() {
  return practices.reduce(
    (count, practice) => {
      const decisions =
        Array.isArray(
          practice.decisions
        )
          ? practice.decisions.length
          : 0;

      return count + decisions;
    },
    0
  );
}


/* =========================================================
   PORTFOLIO EVIDENCE
   ========================================================= */

function getEvidenceCount() {
  return practices.reduce(
    (count, practice) => {
      const evidence =
        Array.isArray(
          practice.evidence
        )
          ? practice.evidence.length
          : 0;

      return count + evidence;
    },
    0
  );
}


/* =========================================================
   CURRENT PRACTICE
   ========================================================= */

function updateCurrentPractice(
  practice
) {
  const practiceStatus =
    document.querySelector(
      ".practice-status"
    );

  if (!practiceStatus) {
    return;
  }

  const strong =
    practiceStatus.querySelector(
      "strong"
    );

  const description =
    practiceStatus.querySelector(
      "span"
    );

  const badge =
    practiceStatus.querySelector(
      ".status-badge"
    );

  const progressBar =
    practiceStatus.querySelector(
      ".practice-progress-bar"
    );

  if (!practice) {
    if (strong) {
      strong.textContent =
        "No active practice";
    }

    if (description) {
      description.textContent =
        "No practice is currently in progress.";
    }

    if (badge) {
      badge.textContent =
        "NO ACTIVE PRACTICE";
    }

    if (progressBar) {
      progressBar.style.width =
        "0%";
    }

    return;
  }

  const submitted =
    Number(
      practice.submittedCount ||
        0
    );

  const members =
    Number(
      practice.memberCount ||
        0
    );

  const percent =
    members > 0
      ? Math.min(
          100,
          Math.round(
            (submitted /
              members) *
              100
          )
        )
      : 0;

  if (strong) {
    strong.textContent =
      practice.title ||
      `Practice #${practice.practiceNumber}`;
  }

  if (description) {
    description.textContent =
      members > 0
        ? `${submitted}/${members} member logs submitted`
        : "Practice is currently in progress.";
  }

  if (badge) {
    badge.textContent =
      practice.status === "ready"
        ? "READY TO CLOSE"
        : "IN PROGRESS";
  }

  if (progressBar) {
    progressBar.style.width =
      `${percent}%`;
  }
}


/* =========================================================
   PRACTICE PROGRESS
   ========================================================= */

function updatePracticeProgress(
  practice
) {
  const memberRows =
    document.querySelectorAll(
      ".member-row"
    );

  if (!practice || !memberRows.length) {
    return;
  }

  /*
   * Detailed individual member status will
   * eventually come from the actual logs.
   *
   * The current dashboard markup contains
   * placeholder members, so this function will
   * be replaced once Team member records are
   * implemented.
   */
}


/* =========================================================
   RECENT ACTIVITY
   ========================================================= */

async function updateRecentActivity(
  practice
) {
  const activityList =
    document.querySelector(
      ".activity-list"
    );

  if (!activityList) {
    return;
  }

  if (!practice) {
    activityList.innerHTML =
      createEmptyActivity(
        "No recent activity."
      );

    return;
  }

  try {
    const logsReference =
      collection(
        db,
        "seasons",
        SEASON_ID,
        "practices",
        practice.id,
        "logs"
      );

    const logsQuery =
      query(
        logsReference,
        orderBy(
          "updatedAt",
          "desc"
        )
      );

    const snapshot =
      await getDocs(
        logsQuery
      );

    if (snapshot.empty) {
      activityList.innerHTML =
        createEmptyActivity(
          "No member logs have been submitted yet."
        );

      return;
    }

    const logs =
      snapshot.docs
        .map(
          (document) => ({
            id: document.id,
            ...document.data()
          })
        )
        .slice(0, 6);

    activityList.innerHTML =
      logs
        .map(
          (log) =>
            createActivityItem(
              log
            )
        )
        .join("");

  } catch (error) {
    console.error(
      "Unable to load recent activity:",
      error
    );

    activityList.innerHTML =
      createEmptyActivity(
        "Recent activity is unavailable."
      );
  }
}


/* =========================================================
   ACTIVITY CARD
   ========================================================= */

function createActivityItem(
  log
) {
  const name =
    log.memberName ||
    log.displayName ||
    log.memberEmail?.split("@")[0] ||
    "Team Member";

  const areas =
    Array.isArray(
      log.workTypes
    )
      ? log.workTypes.join(
          " · "
        )
      : "Engineering";

  const summary =
    log.overallSummary ||
    getFirstMeaningfulDetail(
      log.details
    ) ||
    "Documented work for this practice.";

  const timestamp =
    log.updatedAt ||
    log.submittedAt ||
    null;

  return `
    <div class="activity-row">

      <div class="activity-dot"></div>

      <div class="activity-copy">

        <strong>
          ${escapeHtml(
            summary
          )}
        </strong>

        <span>
          ${escapeHtml(
            areas
          )}
          ·
          ${escapeHtml(
            name
          )}
          ·
          ${escapeHtml(
            formatActivityTime(
              timestamp
            )
          )}
        </span>

      </div>

    </div>
  `;
}


/* =========================================================
   ACTIVITY HELPERS
   ========================================================= */

function getFirstMeaningfulDetail(
  details
) {
  if (!details) {
    return "";
  }

  for (
    const area
    of Object.values(
      details
    )
  ) {
    if (
      !area ||
      typeof area !==
        "object"
    ) {
      continue;
    }

    for (
      const value
      of Object.values(
        area
      )
    ) {
      if (
        typeof value ===
          "string" &&
        value.trim()
      ) {
        return value.trim();
      }
    }
  }

  return "";
}

function formatActivityTime(
  value
) {
  if (!value) {
    return "Recently";
  }

  try {
    return formatRelativeTime(
      value
    );
  } catch {
    return formatDate(
      value
    );
  }
}

function createEmptyActivity(
  message
) {
  return `
    <div
      class="empty-state"
      style="padding: 28px 10px;"
    >
      <p class="muted small">
        ${escapeHtml(
          message
        )}
      </p>
    </div>
  `;
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