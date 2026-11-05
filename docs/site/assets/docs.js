const root = document.documentElement;
const themeButton = document.querySelector("#theme-toggle");

function setTheme(theme) {
  root.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "Light" : "Dark";
  themeButton.setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
  );
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#09090d" : "#ffffff";
}

setTheme(root.dataset.theme);
themeButton.addEventListener("click", () => {
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  setTheme(theme);
  try {
    localStorage.setItem("fluentci-docs-theme", theme);
  } catch {
    /* Storage is optional. */
  }
});

const menuButton = document.querySelector("#menu-toggle");
function closeMenu() {
  document.body.dataset.menuOpen = "false";
  menuButton.setAttribute("aria-expanded", "false");
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  document.body.dataset.menuOpen = String(open);
});
document.querySelector("#menu-backdrop").addEventListener("click", closeMenu);
document.querySelector("#sidebar").addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});

const dialog = document.querySelector("#search-dialog");
const openSearch = () => {
  closeMenu();
  dialog.showModal();
  dialog.querySelector("input")?.focus();
};
document.querySelector("#search-open").addEventListener("click", openSearch);
document
  .querySelector("#search-close")
  .addEventListener("click", () => dialog.close());
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (dialog.open) dialog.close();
    else openSearch();
  }
  if (event.key === "Escape") closeMenu();
});

for (const pre of document.querySelectorAll("pre")) {
  const code = pre.querySelector("code");
  if (!code) continue;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-code";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code");
  button.setAttribute("data-pagefind-ignore", "");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select code";
    }
    setTimeout(() => {
      button.textContent = "Copy";
    }, 2000);
  });
  pre.append(button);
}
