import { useState } from "react";
import { createPortal } from "react-dom";
import type { Theme } from "../theme";
import type { Settings } from "../settings";
import { ThemeBar } from "./ThemeBar";
import { InstanceSettings } from "./InstanceSettings";
import { ProviderSettings } from "./ProviderSettings";

type Props = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  /** Показ ошибок правки конфига — тот же канал, что у остальных экранов. */
  onError: (e: string) => void;
};

/**
 * Настройки — одни на всё приложение: и вкус человека (тема, показ справки
 * памяти), и конфиг ядра (модель, лимит ходов, память).
 *
 * Раньше это были два раскрывающихся блока подряд в подвале рельсы, и разница
 * между ними не читалась: «настройки» против «инстанс» — человеку это ни о чём не
 * говорит, он ищет одну кнопку. Источник правды по-прежнему разный (localStorage
 * и `config.toml`), но для человека это один экран с двумя разделами.
 *
 * Панель — оверлей над рельсой, а не секция в потоке: список сессий бывает
 * длинным, и раскрытая панель в подвале сжимала сама себя до тридцати пикселей
 * со скроллом внутри — пользоваться было нельзя.
 */
export function SettingsBar({
  theme,
  setTheme,
  settings,
  setSettings,
  onError,
}: Props) {
  const [open, setOpen] = useState(() =>
    new URLSearchParams(location.search).has("settings"),
  );
  return (
    <div className="settings" data-open={open}>
      <button
        className="settings__head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>настройки</span>
        <span className="settings__caret">{open ? "▾" : "▸"}</span>
      </button>
      {/*
       * Портал в `body`, а не секция внутри рельсы: у рельсы на узком экране
       * есть `transform` (шторка), а трансформированный предок делает
       * `position: fixed` относительным ему — панель уезжала за левый край
       * экрана вместе со шторкой.
       */}
      {open &&
        createPortal(
          <>
            {/* Клик по затемнению закрывает панель: «настройки» остаются на месте
              как заголовок, отдельная кнопка × есть в самом заголовке панели. */}
            <button
              className="settings__scrim"
              aria-label="закрыть настройки"
              onClick={() => setOpen(false)}
            />
            <div
              className="settings__panel"
              role="dialog"
              aria-label="настройки"
            >
              <div className="settings__title">
                <span>настройки</span>
                <button
                  className="settings__close"
                  onClick={() => setOpen(false)}
                  aria-label="закрыть"
                >
                  ×
                </button>
              </div>

              <section className="settings__group">
                <div className="settings__legend">вид</div>
                <div className="settings__body">
                  <div className="settings__row">
                    <span>тема</span>
                    <ThemeBar theme={theme} setTheme={setTheme} />
                  </div>
                  <label className="settings__check">
                    <input
                      type="checkbox"
                      checked={settings.showRecall}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          showRecall: e.target.checked,
                        })
                      }
                    />
                    <span>
                      показывать справку памяти
                      <small>
                        серая строка над ходом: что агент вспомнил перед ответом
                      </small>
                    </span>
                  </label>
                </div>
              </section>

              <section className="settings__group">
                <div className="settings__legend">
                  провайдеры
                  <small>куда и с каким ключом ходить; переключение — со следующего хода</small>
                </div>
                <ProviderSettings onError={onError} />
              </section>

              <section className="settings__group">
                <div className="settings__legend">
                  инстанс
                  <small>конфиг ядра, действует со следующего хода</small>
                </div>
                <InstanceSettings onError={onError} />
              </section>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
