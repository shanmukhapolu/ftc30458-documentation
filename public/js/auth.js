// public/js/auth.js

import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

/**
 * Require an authenticated user.
 *
 * If a user is already signed in, the callback receives
 * the Firebase User object.
 *
 * If no user is signed in, redirect to the login page.
 *
 * @param {(user: import("firebase/auth").User) => void} onAuthenticated
 * @returns {() => void} unsubscribe function
 */
export function requireAuth(onAuthenticated) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      const currentPath =
        window.location.pathname +
        window.location.search +
        window.location.hash;

      const redirect =
        currentPath &&
        currentPath !== "/" &&
        currentPath !== "/index.html"
          ? `?redirect=${encodeURIComponent(currentPath)}`
          : "";

      window.location.replace(`./index.html${redirect}`);
      return;
    }

    if (typeof onAuthenticated === "function") {
      onAuthenticated(user);
    }
  });
}

/**
 * Redirect an authenticated user away from the login page.
 *
 * Useful on index.html.
 *
 * @param {string} destination
 * @returns {() => void} unsubscribe function
 */
export function redirectIfAuthenticated(
  destination = "./dashboard.html"
) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.replace(destination);
    }
  });
}

/**
 * Sign out the current user.
 *
 * @returns {Promise<void>}
 */
export async function logout() {
  await signOut(auth);
}

/**
 * Get a useful display name for a Firebase user.
 *
 * @param {import("firebase/auth").User} user
 * @returns {string}
 */
export function getDisplayName(user) {
  if (!user) {
    return "Team Member";
  }

  if (user.displayName?.trim()) {
    return user.displayName.trim();
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "Team Member";
}

/**
 * Get initials for avatars.
 *
 * @param {import("firebase/auth").User} user
 * @returns {string}
 */
export function getInitials(user) {
  const displayName = getDisplayName(user);

  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  }

  return displayName
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Get the user's email safely.
 *
 * @param {import("firebase/auth").User} user
 * @returns {string}
 */
export function getUserEmail(user) {
  return user?.email || "";
}

/**
 * Attach a standard logout handler to a button.
 *
 * @param {string|HTMLElement} buttonOrSelector
 * @param {Object} options
 * @param {string} options.redirect
 */
export function attachLogout(
  buttonOrSelector,
  {
    redirect = "./index.html"
  } = {}
) {
  const button =
    typeof buttonOrSelector === "string"
      ? document.querySelector(buttonOrSelector)
      : buttonOrSelector;

  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;

    try {
      await logout();
      window.location.replace(redirect);
    } catch (error) {
      console.error("Sign out failed:", error);

      button.disabled = false;

      if (typeof window.showToast === "function") {
        window.showToast(
          "Unable to sign out. Please try again."
        );
      }
    }
  });
}