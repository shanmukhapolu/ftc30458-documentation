import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const fallbackConfig = {
  apiKey: "AIzaSyA-yYsv1j0tJ0c0YpH54",
  authDomain: "ftcdocumentation-53b62.firebaseapp.com",
  projectId: "ftcdocumentation-53b62",
  storageBucket: "ftcdocumentation-53b62.firebasestorage.app",
  messagingSenderId: "263099087153",
  appId: "1:263099087153:web:be61b8a9f9f314afda1810",
  measurementId: "G-SJTJZF1ZJS"
};

async function loadFirebaseConfig() {
  try {
    const response = await fetch("/__/firebase/init.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Firebase Hosting configuration request failed.");
    }

    const config = await response.json();

    if (!config || !config.projectId) {
      throw new Error("Firebase Hosting returned an invalid configuration.");
    }

    return config;
  } catch (error) {
    console.warn("Using fallback Firebase configuration:", error);
    return fallbackConfig;
  }
}

const firebaseConfig = await loadFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

await setPersistence(auth, browserLocalPersistence);

export { app, auth, db, storage, firebaseConfig };
