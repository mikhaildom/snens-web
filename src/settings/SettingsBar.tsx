import { useState } from "react";
import type { Theme } from "../theme";
import type { Settings } from "../settings";
import { ThemeBar } from "./ThemeBar";

type Props = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
};

/**
 * Настройки поверхности: всё, что человек настраивает под себя.
 * Сейчас это тема и показ справки памяти; место рассчитано на добавление
 * новых галочек без перестройки рельсы.
 */
export function SettingsBar({ theme, setTheme, settings, setSettings }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="settings" data-open={open}>
      <button className="settings__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>настройки</span>
        <span className="settings__caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="settings__body">
          <div className="settings__row">
            <span>тема</span>
            <ThemeBar theme={theme} setTheme={setTheme} />
          </div>
          <label className="settings__check">
            <input
              type="checkbox"
              checked={settings.showRecall}
              onChange={(e) => setSettings({ ...settings, showRecall: e.target.checked })}
            />
            <span>
              показывать справку памяти
              <small>серая строка над ходом: что агент вспомнил перед ответом</small>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
