import { memo } from "react";
import type { SearchHit, SessionInfo } from "../api";
import { relTime } from "../lib/time";
import { Icon } from "../ui/icons";

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
  onRemove: (id: string) => void;
  onClose: () => void;
  open: boolean;
  /** Узкий режим: только значки. */
  mini: boolean;
  onToggleMini: () => void;
  /** Какая вкладка открыта вместо чата: кнопка этой вкладки подсвечена. */
  page: "chat" | "tickets" | "settings";
  onTickets: () => void;
  onSettings: () => void;
};

/** Значок сессии: один из восьми пиксельных, выбран по id, чтобы не прыгал. */
function glyphPos(id: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const pos = `${-18 * (Math.abs(h) % 8)}px 0`;
  return { WebkitMaskPosition: pos, maskPosition: pos };
}

/**
 * Группа по дню последнего изменения: «Сегодня», «Вчера», «Ранее». Без
 * времени приходит только что созданная сессия: она сегодняшняя.
 */
function dayGroup(ts?: number): string {
  if (!ts) return "Сегодня";
  const d = new Date(ts * 1000);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return "Сегодня";
  if (d.getTime() >= start - 86_400_000) return "Вчера";
  return "Ранее";
}

/**
 * Левая колонка: поиск сверху, «Новая сессия» первой строкой списка, сессии по
 * дням, внизу тикеты, настройки и сворачивание.
 */
export const Rail = memo(function Rail(p: RailProps) {
  const roots = p.sessions.filter((s) => !s.parent);
  const searchMode = p.query.trim().length > 0;
  const groups: Array<[string, SessionInfo[]]> = [];
  for (const s of roots) {
    const g = dayGroup(s.updated_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(s);
    else groups.push([g, [s]]);
  }
  return (
    <nav className="rail" data-open={p.open} aria-label="Сессии">
      <div className="rail-top">
        <label className="rsearch">
          <Icon name="search" />
          <input
            value={p.query}
            placeholder="Поиск"
            aria-label="Поиск по сессиям и сообщениям"
            onChange={(e) => p.setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") p.setQuery("");
            }}
          />
          {p.searching && <span className="rsearch__busy">…</span>}
        </label>
        <button className="ibtn mob-only" onClick={p.onClose} aria-label="Закрыть список">
          <Icon name="close" />
        </button>
      </div>

      <div className="rail-list">
        {searchMode ? (
          <>
            <div className="rail-date">Найдено {p.hits.length}</div>
            {p.hits.map((h) => (
              <button key={h.id} className="s-item" data-on={p.active === h.id} onClick={() => p.onPick(h.id)}>
                <span className="s-text">{h.title || h.matches[0]?.snippet || "Без названия"}</span>
                {h.matches[0] && <span className="s-hit">{h.matches[0].snippet}</span>}
              </button>
            ))}
            {!p.searching && p.hits.length === 0 && <div className="rail-empty">Ничего не нашлось</div>}
          </>
        ) : (
          <>
            <button className="s-item s-new" onClick={p.onNew} title="Новая сессия">
              <Icon name="plus" />
              <span className="s-text">Новая сессия</span>
            </button>
            {groups.map(([title, list], gi) => (
              <div key={`${gi}:${title}`} className="rail-group">
                <div className="rail-date">{title}</div>
                {list.map((s) => (
                  <div key={s.id} className="s-row" data-removing={p.removing === s.id}>
                    <button
                      className="s-item"
                      data-on={p.active === s.id && p.page === "chat"}
                      onClick={() => p.onPick(s.id)}
                      title={s.title || "Новая сессия"}
                    >
                      <span className="glyph" data-run={s.state === "running"} style={glyphPos(s.id)} aria-hidden="true" />
                      <span className="s-text">{s.title || "Новая сессия"}</span>
                      <span className="s-meta">{relTime(s.updated_at)}</span>
                    </button>
                    {p.removing === s.id ? (
                      <span className="s-confirm">
                        <button
                          className="s-yes"
                          onClick={(e) => {
                            e.stopPropagation();
                            p.onRemove(s.id);
                          }}
                        >
                          Удалить
                        </button>
                        <button
                          className="ibtn"
                          aria-label="Отмена"
                          onClick={(e) => {
                            e.stopPropagation();
                            p.setRemoving(null);
                          }}
                        >
                          <Icon name="close" />
                        </button>
                      </span>
                    ) : (
                      <button
                        className="ibtn s-trash"
                        title="Удалить сессию"
                        aria-label="Удалить сессию"
                        onClick={(e) => {
                          e.stopPropagation();
                          p.setRemoving(s.id);
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="rail-foot">
        <button
          className="ibtn"
          data-on={p.page === "tickets"}
          onClick={p.onTickets}
          aria-label="Тикеты и ревью"
          title="Тикеты и ревью"
        >
          <Icon name="tickets" />
        </button>
        <button
          className="ibtn"
          data-on={p.page === "settings"}
          onClick={p.onSettings}
          aria-label="Настройки"
          title="Настройки"
        >
          <Icon name="settings" />
        </button>
        <button className="ibtn desk-only" onClick={p.onToggleMini} aria-label="Свернуть список" title="Свернуть список">
          <Icon name="rail" />
        </button>
      </div>
    </nav>
  );
});
