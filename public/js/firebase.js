// public/js/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

// Firebase configuration for FTC 30458 Engineering Log
const firebaseConfig = {
  apiKey: "AIzaSyA-yYvSV8mIUj0TAgQr31DXtu0c0YpH54",
  authDomain: "ftcdocumentation-53b62.firebaseapp.com",
  projectId: "ftcdocumentation-53b62",
  storageBucket: "ftcdocumentation-53b62.firebasestorage.app",
  messagingSenderId: "263099087153",
  appId: "1:263099087153:web:be61b8a9f9f314afda1810",
  measurementId: "G-SJTJZF1ZJS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Keep users signed in across browser sessions.
// Firebase restores the authenticated session automatically
// when browser-local persistence is available.
await setPersistence(auth, browserLocalPersistence);

// Export everything other files will need.
export {
  app,
  auth,
  db,
  storage
};