import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export function requireAuth(onAuthenticated, options = {}) {
  return onAuthStateChanged(auth, async function(user) {
    if (!user) {
      window.location.replace("./index.html");
      return;
    }

    let profile = null;

    try {
      profile = await ensureUserProfile(user);
    } catch (error) {
      console.error("Unable to load team profile:", error);
    }

    if (!options.allowIncomplete && profile && profile.profileComplete !== true) {
      window.location.replace("./onboarding.html");
      return;
    }

    if (typeof onAuthenticated === "function") {
      await onAuthenticated(user, profile);
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

  const reference = doc(db, "users", user.uid);
  const snapshot = await getDoc(reference);

  if (snapshot.exists()) {
    const existing = snapshot.data();
    return {
      ...existing,
      email: user.email || existing.email || ""
    };
  }

  const profile = {
    displayName: "",
    role: "",
    email: user.email || "",
    department: "",
    photoURL: user.photoURL || "",
    profileComplete: false,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(reference, profile);
  return profile;
}

export async function saveUserProfile(user, data) {
  const displayName = String(data.displayName || "").trim();
  const role = String(data.role || "").trim();

  if (!displayName) {
    throw new Error("Name is required.");
  }

  if (!role) {
    throw new Error("Role is required.");
  }

  await updateProfile(user, { displayName });

  await setDoc(
    doc(db, "users", user.uid),
    {
      displayName,
      role,
      email: user.email || "",
      profileComplete: true,
      active: true,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return {
    displayName,
    role,
    email: user.email || "",
    profileComplete: true
  };
}

export async function sendResetPasswordEmail(user = auth.currentUser) {
  if (!user || !user.email) {
    throw new Error("No signed-in email address is available.");
  }

  await sendPasswordResetEmail(auth, user.email);
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
