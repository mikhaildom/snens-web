import type { Theme } from "../theme";

/** Выбор темы: три состояния, как в системных настройках. */
export function ThemeBar({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const items: Array<[Theme, string]> = [
    ["auto", "sys"],
    ["light", "lgt"],
    ["dark", "drk"],
  ];
  return (
    <div className="themebar" role="group" aria-label="theme">
      {items.map(([key, label]) => (
        <button
          key={key}
          aria-pressed={theme === key}
          title={`theme: ${key === "auto" ? "по системе" : key}`}
          onClick={() => setTheme(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
