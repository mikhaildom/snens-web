export type Theme = "auto" | "light" | "dark";

const KEY = "snens-theme";
const VALID: Theme[] = ["auto", "light", "dark"];

function param(): Theme | null {
  const q = new URLSearchParams(location.search).get("theme");
  return q && (VALID as string[]).includes(q) ? (q as Theme) : null;
}

export function initialTheme(): Theme {
  const fromUrl = param();
  if (fromUrl) return fromUrl;
  const saved = localStorage.getItem(KEY) as Theme | null;
  return saved && VALID.includes(saved) ? saved : "auto";
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  // ?theme= — разовый просмотр (скриншоты, шеринг), в localStorage не оседает
  if (!param()) localStorage.setItem(KEY, t);
}
