// public/js/ui.js

/* =========================================================
   GENERAL DOM HELPERS
   ========================================================= */

/**
 * Shorthand for document.querySelector().
 *
 * @param {string} selector
 * @param {ParentNode} [parent=document]
 * @returns {Element|null}
 */
export function $(
  selector,
  parent = document
) {
  return parent.querySelector(selector);
}

/**
 * Shorthand for document.querySelectorAll().
 *
 * @param {string} selector
 * @param {ParentNode} [parent=document]
 * @returns {Element[]}
 */
export function $$(
  selector,
  parent = document
) {
  return [...parent.querySelectorAll(selector)];
}


/* =========================================================
   TEXT / DISPLAY HELPERS
   ========================================================= */

/**
 * Safely set text content.
 *
 * @param {string|Element|null} target
 * @param {string} value
 */
export function setText(target, value) {
  const element =
    typeof target === "string"
      ? $(target)
      : target;

  if (element) {
    element.textContent = value ?? "";
  }
}

/**
 * Create initials from a name.
 *
 * @param {string} name
 * @returns {string}
 */
export function initials(name = "") {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "MM";
  }

  if (parts.length >= 2) {
    return (
      `${parts[0][0]}${parts[parts.length - 1][0]}`
    ).toUpperCase();
  }

  return parts[0]
    .slice(0, 2)
    .toUpperCase();
}


/* =========================================================
   DATE / TIME
   ========================================================= */

/**
 * Format a JavaScript Date or Firestore Timestamp.
 *
 * @param {Date|Object|string|number} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDate(
  value,
  options = {
    month: "short",
    day: "numeric",
    year: "numeric"
  }
) {
  if (!value) {
    return "—";
  }

  let date;

  if (
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    options
  ).format(date);
}

/**
 * Format a date with time.
 *
 * @param {Date|Object|string|number} value
 * @returns {string}
 */
export function formatDateTime(value) {
  return formatDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * Format a date relative to now.
 *
 * @param {Date|Object|string|number} value
 * @returns {string}
 */
export function formatRelativeTime(value) {
  if (!value) {
    return "—";
  }

  let date;

  if (
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const difference =
    Date.now() - date.getTime();

  const seconds = Math.floor(
    Math.abs(difference) / 1000
  );

  const future = difference < 0;

  if (seconds < 60) {
    return future
      ? "in a few seconds"
      : "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return future
      ? `in ${minutes}m`
      : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return future
      ? `in ${hours}h`
      : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return future
      ? `in ${days}d`
      : `${days}d ago`;
  }

  return formatDate(date);
}


/* =========================================================
   TOAST NOTIFICATIONS
   ========================================================= */

/**
 * Show a temporary notification.
 *
 * Usage:
 * showToast("Practice saved");
 * showToast("Unable to save", "error");
 *
 * @param {string} message
 * @param {"success"|"error"|"warning"|"info"} [type="info"]
 * @param {number} [duration=3200]
 */
export function showToast(
  message,
  type = "info",
  duration = 3200
) {
  let container =
    document.getElementById(
      "toast-container"
    );

  if (!container) {
    container = document.createElement("div");

    container.id =
      "toast-container";

    Object.assign(
      container.style,
      {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: "9999",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "min(360px, calc(100vw - 40px))",
        pointerEvents: "none"
      }
    );

    document.body.appendChild(container);
  }

  const toast =
    document.createElement("div");

  const colors = {
    success: {
      background: "#edf8f2",
      border: "#c8ead8",
      text: "#247a55"
    },

    error: {
      background: "#fff5f4",
      border: "#f2c5c2",
      text: "#b42318"
    },

    warning: {
      background: "#fff7e9",
      border: "#f0dbb8",
      text: "#a76516"
    },

    info: {
      background: "#eef4ff",
      border: "#cddbf4",
      text: "#355c9a"
    }
  };

  const palette =
    colors[type] || colors.info;

  Object.assign(
    toast.style,
    {
      padding: "12px 14px",
      border: `1px solid ${palette.border}`,
      borderRadius: "10px",
      background: palette.background,
      color: palette.text,
      fontFamily: '"Inter", sans-serif',
      fontSize: "12px",
      fontWeight: "600",
      lineHeight: "1.45",
      boxShadow:
        "0 10px 30px rgba(17, 24, 39, 0.08)",
      opacity: "0",
      transform: "translateY(8px)",
      transition:
        "opacity 0.18s ease, transform 0.18s ease",
      pointerEvents: "auto"
    }
  );

  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform =
      "translateY(0)";
  });

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform =
      "translateY(8px)";

    window.setTimeout(() => {
      toast.remove();
    }, 200);
  }, duration);
}

// Make it available to existing inline scripts too.
window.showToast = showToast;


/* =========================================================
   LOADING STATES
   ========================================================= */

/**
 * Set a button into or out of a loading state.
 *
 * @param {HTMLButtonElement} button
 * @param {boolean} loading
 * @param {string} [loadingText="Loading…"]
 */
export function setButtonLoading(
  button,
  loading,
  loadingText = "Loading…"
) {
  if (!button) {
    return;
  }

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText =
        button.textContent;
    }

    button.disabled = true;
    button.textContent = loadingText;
  } else {
    button.disabled = false;

    if (button.dataset.originalText) {
      button.textContent =
        button.dataset.originalText;

      delete button.dataset.originalText;
    }
  }
}


/**
 * Show or hide a loading element.
 *
 * @param {string|Element} target
 * @param {boolean} loading
 */
export function setLoading(
  target,
  loading
) {
  const element =
    typeof target === "string"
      ? $(target)
      : target;

  if (!element) {
    return;
  }

  element.classList.toggle(
    "hidden",
    !loading
  );
}


/* =========================================================
   MODALS
   ========================================================= */

/**
 * Open a modal backdrop.
 *
 * @param {string|Element} target
 */
export function openModal(target) {
  const element =
    typeof target === "string"
      ? $(target)
      : target;

  if (!element) {
    return;
  }

  element.classList.add("open");

  document.body.style.overflow =
    "hidden";
}


/**
 * Close a modal backdrop.
 *
 * @param {string|Element} target
 */
export function closeModal(target) {
  const element =
    typeof target === "string"
      ? $(target)
      : target;

  if (!element) {
    return;
  }

  element.classList.remove("open");

  document.body.style.overflow =
    "";
}


/**
 * Automatically wire modal close controls.
 */
export function initializeModals() {
  $$("[data-modal-open]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset.modalOpen;

          openModal(`#${id}`);
        }
      );
    }
  );

  $$("[data-modal-close]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          const backdrop =
            button.closest(
              ".modal-backdrop"
            );

          closeModal(backdrop);
        }
      );
    }
  );

  $$(".modal-backdrop").forEach(
    (backdrop) => {
      backdrop.addEventListener(
        "click",
        (event) => {
          if (
            event.target === backdrop
          ) {
            closeModal(backdrop);
          }
        }
      );
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }

      const openModals =
        $$(".modal-backdrop.open");

      openModals.forEach(
        (modal) => closeModal(modal)
      );
    }
  );
}


/* =========================================================
   MOBILE SIDEBAR
   ========================================================= */

/**
 * Toggle the mobile sidebar.
 *
 * This expects:
 *
 * #sidebar
 * #sidebar-overlay
 * #sidebar-toggle
 */
export function initializeMobileSidebar() {
  const sidebar =
    document.getElementById(
      "sidebar"
    );

  const overlay =
    document.getElementById(
      "sidebar-overlay"
    );

  const toggle =
    document.getElementById(
      "sidebar-toggle"
    );

  if (!sidebar) {
    return;
  }

  const closeSidebar = () => {
    sidebar.classList.remove(
      "mobile-open"
    );

    overlay?.classList.remove(
      "open"
    );
  };

  const toggleSidebar = () => {
    const open =
      sidebar.classList.toggle(
        "mobile-open"
      );

    overlay?.classList.toggle(
      "open",
      open
    );
  };

  toggle?.addEventListener(
    "click",
    toggleSidebar
  );

  overlay?.addEventListener(
    "click",
    closeSidebar
  );

  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth > 780) {
        closeSidebar();
      }
    }
  );
}


/* =========================================================
   CONFIRMATION
   ========================================================= */

/**
 * Lightweight confirmation helper.
 *
 * @param {string} message
 * @returns {boolean}
 */
export function confirmAction(
  message
) {
  return window.confirm(message);
}