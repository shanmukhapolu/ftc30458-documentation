import { auth, db } from "./firebase.js?v=20261118-01";
import {
  onAuthStateChanged,
  signOut,
  signInWithCustomToken,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const CENTRAL_AUTH_URL = "https://auth.ftc30458.com";
const OAUTH_CLIENT_ID = "ftc30458-documentation";
const OAUTH_CALLBACK_URL = "https://log.ftc30458.com/auth-callback.html";
const STORAGE_KEYS = {
  state: "ftc30458.oauth.state",
  verifier: "ftc30458.oauth.verifier",
  returnTo: "ftc30458.oauth.returnTo"
};

function base64Url(bytes) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function beginCentralSignIn(returnTo = "./dashboard.html") {
  const state = randomBase64Url();
  const verifier = randomBase64Url(48);
  const challenge = await createChallenge(verifier);
  const safeReturnTo = typeof returnTo === "string" &&
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/dashboard.html";

  sessionStorage.setItem(STORAGE_KEYS.state, state);
  sessionStorage.setItem(STORAGE_KEYS.verifier, verifier);
  sessionStorage.setItem(STORAGE_KEYS.returnTo, safeReturnTo);

  const authorizationUrl = new URL("/oauth/authorize", CENTRAL_AUTH_URL);
  authorizationUrl.search = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_CALLBACK_URL,
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();

  window.location.assign(authorizationUrl.href);
}

export async function completeCentralSignIn() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const expectedState = sessionStorage.getItem(STORAGE_KEYS.state);
  const verifier = sessionStorage.getItem(STORAGE_KEYS.verifier);
  const returnTo = sessionStorage.getItem(STORAGE_KEYS.returnTo) || "/dashboard.html";

  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    throw new Error("The sign-in response could not be verified. Return to the documentation site and try again.");
  }

  const response = await fetch(new URL("/oauth/token", CENTRAL_AUTH_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_CALLBACK_URL,
      code,
      code_verifier: verifier
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.firebaseToken) {
    throw new Error(result.error || "Central sign-in could not be completed. Please try again.");
  }

  await signInWithCustomToken(auth, result.firebaseToken);
  Object.values(STORAGE_KEYS).forEach(key => sessionStorage.removeItem(key));
  const destination = returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/dashboard.html";
  window.history.replaceState({}, document.title, window.location.pathname);
  window.location.replace(destination);
}

export function requireAuth(onAuthenticated, options = {}) {
  return onAuthStateChanged(auth, async function(user) {
    if (!user) {
      beginCentralSignIn(window.location.pathname + window.location.search).catch(error => {
        console.error("Unable to start central sign-in:", error);
        window.location.replace("./index.html");
      });
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
    if (user) window.location.replace(destination || "./dashboard.html");
  });
}

export async function ensureUserProfile(user) {
  if (!user || !user.uid) return null;
  const reference = doc(db, "users", user.uid);
  const snapshot = await getDoc(reference);

  if (snapshot.exists()) {
    const existing = snapshot.data();
    return { ...existing, email: user.email || existing.email || "" };
  }

  const profile = {
    displayName: user.displayName || "",
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
  if (!displayName) throw new Error("Name is required.");
  if (!role) throw new Error("Role is required.");

  await updateProfile(user, { displayName });
  await setDoc(doc(db, "users", user.uid), {
    displayName,
    role,
    email: user.email || "",
    profileComplete: true,
    active: true,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return { displayName, role, email: user.email || "", profileComplete: true };
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
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email) return user.email.split("@")[0];
  return "Team Member";
}

export function getInitials(user) {
  const name = getDisplayName(user);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function attachLogout(buttonOrSelector, options) {
  const opts = options || {};
  const button = typeof buttonOrSelector === "string"
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
