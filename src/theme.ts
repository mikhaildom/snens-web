import { useEffect, useState } from "react";

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

/**
 * Тема, которая сейчас на странице. Артефакту (`iframe`) она нужна отдельно:
 * внутри песочницы `prefers-color-scheme` свой, а ручной выбор темы до неё не
 * доходит. Источник — атрибут на `documentElement`, а не состояние `App`:
 * тот же признак ставит `applyTheme`, и второго источника правды нет.
 */
export function useTheme(): Theme {
  const read = () => (document.documentElement.dataset.theme as Theme) || "auto";
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}
