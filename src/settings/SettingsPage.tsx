import { useEffect, useRef, useState } from "react";
import type { Theme } from "../theme";
import type { Accent, Settings } from "../settings";
import { connection } from "../lib/connection.ts";
import { ConnectionBar } from "../pair/PairScreen";
import { ProviderSettings } from "./ProviderSettings";
import { AgentPane, ContextPane, ModelFields, Row, Seg, Toggle, useConfig } from "./ConfigPanes";
import { Icon } from "../ui/icons";

type Pane = "view" | "models" | "agent" | "ctx" | "conn";
const NAV: Array<[Pane, string]> = [
  ["view", "Вид"],
  ["models", "Модели"],
  ["agent", "Агент"],
  ["ctx", "Контекст и память"],
  ["conn", "Подключение"],
];
const ACCENTS: Array<[Accent, string]> = [
  ["mint", "Мятный"],
  ["lilac", "Лиловый"],
  ["acid", "Кислотный"],
  ["red", "Красный"],
];

/**
 * Настройки — вкладка вместо чата и правой панели, а не окно поверх. Слева
 * разделы, справа их содержимое. Закрывается той же кнопкой в рельсе, Esc или
 * крестиком. Правки конфига ядра действуют со следующего хода.
 */
export function SettingsPage({
  theme,
  setTheme,
  settings,
  setSettings,
  onError,
  onClose,
  initial = "view",
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  onError: (e: string) => void;
  onClose: () => void;
  initial?: Pane;
}) {
  const [pane, setPane] = useState<Pane>(initial);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => setPane(initial), [initial]);
  const conn = connection();
  const cfg = useConfig(onError);
  const set = (p: Partial<Settings>) => setSettings({ ...settings, ...p });
  const title = NAV.find(([k]) => k === pane)?.[1] ?? "";
  return (
    <section
      className="setp"
      tabIndex={-1}
      ref={ref}
      aria-label="Настройки"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <nav className="set-nav" aria-label="Разделы настроек">
        {NAV.map(([k, t]) => (
          <button key={k} data-on={pane === k} onClick={() => setPane(k)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="set-body">
        <div className="set-top">
          <h2>{title}</h2>
          {cfg.saved && pane !== "view" && pane !== "conn" && (
            <span className="set-saved" role="status">
              Сохранено. Действует со следующего хода
            </span>
          )}
          <button className="ibtn" onClick={onClose} aria-label="Закрыть настройки" title="Закрыть: esc">
            <Icon name="close" />
          </button>
        </div>

        {pane === "view" && (
          <>
            <div className="mini" aria-hidden="true">
              <div className="mini-r">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="mini-m">
                <span className="u" />
                <i style={{ width: "86%" }} />
                <i style={{ width: "64%" }} />
                <span className="c" />
              </div>
            </div>
            <Row title="Тема" desc="Тёмная, светлая или как в системе.">
              <Seg
                label="Тема"
                value={theme}
                options={[
                  ["dark", "Тёмная"],
                  ["light", "Светлая"],
                  ["auto", "Системная"],
                ]}
                onChange={setTheme}
              />
            </Row>
            <Row title="Акцент" desc="Один цвет на весь интерфейс: фокус, кнопка отправки, дизер.">
              <div className="seg-c" role="group" aria-label="Акцент">
                {ACCENTS.map(([k, t]) => (
                  <button key={k} data-on={settings.accent === k} aria-label={t} title={t} onClick={() => set({ accent: k })}>
                    <span className="sw" data-accent={k} />
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Шрифт заголовков" desc="Заголовки и логотип на первом экране. Основной текст всегда Geist, код Geist Mono.">
              <Seg
                label="Шрифт заголовков"
                value={settings.head}
                options={[
                  ["geist", "Geist"],
                  ["akt", "Akt"],
                  ["lack", "Lack"],
                  ["obligat", "Obligat"],
                ]}
                onChange={(head) => set({ head })}
              />
            </Row>
            <Row title="Форма дизера" desc="Фон первого экрана. В режиме «Авто» форма меняется с каждым показом." wide>
              <Seg
                label="Форма дизера"
                value={settings.form}
                options={[
                  ["auto", "Авто"],
                  ["wave", "Волны"],
                  ["clouds", "Облака"],
                  ["casey", "Полосы"],
                  ["rays", "Лучи"],
                  ["dunes", "Дюны"],
                ]}
                onChange={(form) => set({ form })}
              />
            </Row>
            <Row title="Справка памяти" desc="Серая строка над ходом: что агент вспомнил перед ответом.">
              <Toggle label="Справка памяти" on={settings.showRecall} onChange={(showRecall) => set({ showRecall })} />
            </Row>
          </>
        )}
        {pane === "models" && (
          <>
            <p className="set-note">Куда и с каким ключом ходить. Переключение действует со следующего хода.</p>
            <ProviderSettings onError={onError} />
            <ModelFields c={cfg} />
          </>
        )}
        {pane === "agent" && <AgentPane c={cfg} />}
        {pane === "ctx" && <ContextPane c={cfg} />}
        {pane === "conn" && (
          <div className="set-legacy">
            <p className="set-note">Адрес ядра и токен этого устройства.</p>
            <ConnectionBar conn={conn.conn} source={conn.source} onChanged={() => location.reload()} onError={onError} />
          </div>
        )}
      </div>
    </section>
  );
}
