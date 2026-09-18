import { db } from "./firebase.js";
import { doc, collection, onSnapshot, orderBy, query, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let currentUser = null;
let practices = [];
let logCounts = new Map();
let logUnsubs = new Map();

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function formatDateKey(key) {
  const parts = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {month:"long",day:"numeric",year:"numeric"}).format(new Date(parts[0], parts[1]-1, parts[2]));
}

function esc(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function createToday() {
  const key = todayKey();
  return setDoc(doc(db, "practices", key), {
    title: formatDateKey(key),
    dateKey: key,
    createdBy: currentUser.uid,
    createdByEmail: currentUser.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true }).then(function() {
    window.location.href = "./practice.html?id=" + encodeURIComponent(key);
  });
}

function subscribeLogs(practice) {
  if (logUnsubs.has(practice.id)) return;
  const unsubscribe = onSnapshot(collection(db, "practices", practice.id, "logs"), function(snapshot) {
    logCounts.set(practice.id, snapshot.size);
    render();
  });
  logUnsubs.set(practice.id, unsubscribe);
}

function render() {
  const list = document.getElementById("practice-list");
  const queryText = document.getElementById("practice-search").value.trim().toLowerCase();

  const filtered = practices.filter(function(practice) {
    const date = formatDateKey(practice.dateKey || practice.id);
    return !queryText || date.toLowerCase().includes(queryText) || String(practice.notes || "").toLowerCase().includes(queryText);
  });

  if (!filtered.length) {
    list.innerHTML =
      '<div class="card-shell"><div class="empty-state"><div class="empty-icon">▣</div><h3>No practices found</h3><p>Create today\\'s practice or change your search.</p></div></div>';
    return;
  }

  list.innerHTML = filtered.map(function(practice) {
    const key = practice.dateKey || practice.id;
    const count = logCounts.get(practice.id) || 0;
    return '<article class="practice-row" tabindex="0" data-id="' + esc(practice.id) + '">' +
      '<div class="practice-number">LOG<div class="practice-date">Practice</div></div>' +
      '<div class="practice-main"><h3 class="practice-title">' + esc(formatDateKey(key)) + '</h3>' +
      '<p class="practice-description">' + count + ' member ' + (count === 1 ? "log" : "logs") + ' documented. Open to see the shared record.</p>' +
      '<div class="practice-meta"><span>One log per member</span><span>•</span><span>Editable anytime</span><span>•</span><span>Live synced</span></div></div>' +
      '<div class="practice-side"><span class="chip ' + (key === todayKey() ? "chip-teal" : "chip-neutral") + '">' + (key === todayKey() ? "Today" : "Practice") + '</span></div>' +
    '</article>';
  }).join("");

  list.querySelectorAll("[data-id]").forEach(function(row) {
    row.addEventListener("click", function() {
      window.location.href = "./practice.html?id=" + encodeURIComponent(row.dataset.id);
    });
    row.addEventListener("keydown", function(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = "./practice.html?id=" + encodeURIComponent(row.dataset.id);
      }
    });
  });
}

export function initializePractices(user) {
  currentUser = user;

  document.getElementById("create-practice").addEventListener("click", createToday);
  document.getElementById("practice-search").addEventListener("input", render);

  const practicesQuery = query(collection(db, "practices"), orderBy("dateKey", "desc"));

  onSnapshot(practicesQuery, function(snapshot) {
    practices = snapshot.docs.map(function(item) {
      return { id: item.id, ...item.data() };
    });

    practices.forEach(subscribeLogs);
    render();
  });
}
