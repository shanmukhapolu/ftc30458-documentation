const STORAGE_KEY = "ftc30458-theme";

function preferredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}

export function applyTheme() {
  const active = preferredTheme();
  document.documentElement.dataset.theme = active;
  return active;
}

export function toggleTheme() {
  const next = applyTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.dataset.theme = next;
  return next;
}

export function initializeThemeToggle() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;

  const sync = () => {
    const active = applyTheme();
    button.textContent = active === "dark" ? "Light mode" : "Dark mode";
    button.title = active === "dark" ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", button.title);
  };

  sync();
  button.addEventListener("click", () => {
    toggleTheme();
    sync();
  });
}
