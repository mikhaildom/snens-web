import { memo } from "react";
import type { SearchHit, SessionInfo } from "../api";
import type { Settings } from "../settings";
import type { Theme } from "../theme";
import { connection, surfaceLabel } from "../lib/connection";
import { relTime } from "../lib/time";
import { SettingsBar } from "../settings/SettingsBar";

type RailProps = {
  sessions: SessionInfo[];
  active: string | null;
  query: string;
  setQuery: (q: string) => void;
  hits: SearchHit[];
  searching: boolean;
  removing: string | null;
  setRemoving: (id: string | null) => void;
  onPick: (id: string) => void;
  onNew: () => void;
  /** Открыть дашборд тикетов и ревью — отдельной страницей. */
  onDashboard: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  /** Показ ошибок правки настроек — тот же канал, что у остальных экранов. */
  onError: (e: string) => void;
  open: boolean;
};

/**
 * Левая рельса: поиск по журналам, список сессий, создание, настройки.
 *
 * Бейдж рядом с маркой — не константа: в окне десктоп-оболочки «web» было бы
 * враньём (`lib/connection.ts` знает, где клиент запущен).
 */
export const Rail = memo(function Rail(p: RailProps) {
  const roots = p.sessions.filter((s) => !s.parent);
  const searchMode = p.query.trim().length > 0;
  return (
    <nav className="rail" data-open={p.open} aria-label="сессии">
      <div className="rail__brand">
        <span className="rail__mark">snens</span>
        <span className="rail__ver">{surfaceLabel(connection().source)}</span>
        <button className="rail__close" onClick={p.onClose} aria-label="закрыть">
          ×
        </button>
      </div>

      <div className="rail__search">
        <input
          value={p.query}
          placeholder="поиск по сообщениям"
          onChange={(e) => p.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") p.setQuery("");
          }}
        />
        {p.searching && <span className="rail__searching">…</span>}
      </div>

      <div className="rail__section">
        <span>{searchMode ? `найдено ${p.hits.length}` : "сессии"}</span>
        <span className="rail__actions">
          {/* Дашборд рядом с «+»: это второй способ начать работу, а не
              настройка — поэтому в секции, а не в подвале. */}
          <button className="ghost rail__dash" title="тикеты и ревью" onClick={p.onDashboard}>
            ▤
          </button>
          <button className="ghost" title="новая сессия" onClick={p.onNew}>
            +
          </button>
        </span>
      </div>

      {searchMode ? (
        <ul className="rail__list">
          {p.hits.map((h) => (
            <li key={h.id}>
              <button className="rail__item" aria-current={p.active === h.id} onClick={() => p.onPick(h.id)}>
                {h.title || h.matches[0]?.snippet || "—"}
                <small>
                  {relTime(h.updated_at)} · {h.surface}
                </small>
                {h.matches[0] && <span className="rail__hit">{h.matches[0].snippet}</span>}
              </button>
            </li>
          ))}
          {!p.searching && p.hits.length === 0 && <li className="rail__empty">ничего не найдено</li>}
        </ul>
      ) : (
        <ul className="rail__list">
          {roots.map((s) => (
            <li key={s.id} className="rail__row" data-removing={p.removing === s.id}>
              <button className="rail__item" aria-current={p.active === s.id} onClick={() => p.onPick(s.id)}>
                {s.title || "новая сессия"}
                <small>
                  {relTime(s.updated_at)} · {s.surface}
                  {s.state === "running" ? " · идёт" : ""}
                </small>
              </button>
              {p.removing === s.id ? (
                <span className="rail__confirm">
                  <button
                    className="rail__yes"
                    title="удалить"
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onRemove(s.id);
                    }}
                  >
                    ✓
                  </button>
                  {/* Крестик стоит там, где было ведро: двойной клик по
                      привычному месту отменяет, а не удаляет. */}
                  <button
                    className="rail__no"
                    title="отмена"
                    onClick={(e) => {
                      e.stopPropagation();
                      p.setRemoving(null);
                    }}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <button
                  className="rail__trash"
                  title="удалить сессию"
                  aria-label="удалить сессию"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.setRemoving(s.id);
                  }}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      d="M3 4h10M6 4V2.5h4V4M4.5 4l.6 9.5h5.8L11.5 4M6.8 6.5v5M9.2 6.5v5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button className="rail__new" onClick={p.onNew}>
        + новая сессия
      </button>

      <div className="rail__foot">
        <SettingsBar
          theme={p.theme}
          setTheme={p.setTheme}
          settings={p.settings}
          setSettings={p.setSettings}
          onError={p.onError}
        />
      </div>
    </nav>
  );
});
