import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export function requireAuth(onAuthenticated) {
  return onAuthStateChanged(auth, async function(user) {
    if (!user) {
      window.location.replace("./index.html");
      return;
    }
    await ensureUserProfile(user);
    if (typeof onAuthenticated === "function") {
      await onAuthenticated(user);
    }
  });
}

export function redirectIfAuthenticated(destination) {
  return onAuthStateChanged(auth, function(user) {
    if (user) {
      window.location.replace(destination || "./dashboard.html");
    }
  });
}

export async function ensureUserProfile(user) {
  if (!user || !user.uid) return null;

  const ref = doc(db, "users", user.uid);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? snapshot.data() : {};

  const profile = {
    displayName:
      user.displayName ||
      existing.displayName ||
      (user.email ? user.email.split("@")[0] : "Team Member"),
    email: user.email || existing.email || "",
    role: existing.role || "Team Member",
    department: existing.department || "Not assigned",
    photoURL: user.photoURL || existing.photoURL || "",
    active: existing.active !== false,
    updatedAt: serverTimestamp()
  };

  if (!snapshot.exists()) {
    profile.createdAt = serverTimestamp();
  }

  await setDoc(ref, profile, { merge: true });
  return profile;
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function logout() {
  await signOut(auth);
}

export function getDisplayName(user) {
  if (!user) return "Team Member";
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
  }
  if (user.email) return user.email.split("@")[0];
  return "Team Member";
}

export function getInitials(user) {
  const name = getDisplayName(user);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function attachLogout(buttonOrSelector, options) {
  const opts = options || {};
  const button =
    typeof buttonOrSelector === "string"
      ? document.querySelector(buttonOrSelector)
      : buttonOrSelector;

  if (!button) return;

  button.addEventListener("click", async function() {
    button.disabled = true;
    try {
      await logout();
      window.location.replace(opts.redirect || "./index.html");
    } catch (error) {
      console.error("Sign out failed:", error);
      button.disabled = false;
      if (typeof window.showToast === "function") {
        window.showToast("Unable to sign out. Please try again.", "error");
      }
    }
  });
}
