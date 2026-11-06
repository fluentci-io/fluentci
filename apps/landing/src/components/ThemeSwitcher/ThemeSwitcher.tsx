import { useEffect, useState } from "react";

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#09090d" : "#ffffff");
    try {
      localStorage.setItem("fluentci-landing-theme", theme);
    } catch {
      // Switching remains available when browser storage is disabled.
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
