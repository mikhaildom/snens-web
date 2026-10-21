import type { SessionInfo } from "../api";
import { relTime } from "../lib/time";

/**
 * Подагенты: сессии с `parent`. Ядро отдаёт их списком, отдельной ручки нет —
 * фильтруем по полю. Клик открывает сессию подагента как обычную.
 */
export function Agents({
  sessions,
  active,
  onPick,
}: {
  sessions: SessionInfo[];
  active: string | null;
  onPick: (id: string) => void;
}) {
  // «Окна» — про выбранную сессию: показываем только её подагентов. Подагенты
  // других сессий — шум, у них есть сам rail и поиск.
  const roots = active ? sessions.filter((s) => s.parent === active) : [];
  if (!active) {
    return <div className="dock__empty">сессия не выбрана.</div>;
  }
  if (roots.length === 0) {
    return (
      <div className="dock__empty">
        подагентов нет.
        <br />
        когда агент запустит дочернюю сессию, она появится здесь и её можно будет открыть.
      </div>
    );
  }
  return (
    <div className="agents">
      <div className="agents__filter">
        <span>подагенты этой сессии</span>
        <span className="agents__count">{roots.length}</span>
      </div>
      {roots.map((s) => (
        <button
          key={s.id}
          className="agents__row"
          aria-current={active === s.id}
          onClick={() => onPick(s.id)}
        >
          <span className="agents__state" data-state={s.state} />
          <span className="agents__title">{s.title || s.id.slice(0, 8)}</span>
          <span className="agents__meta">{relTime(s.updated_at)}</span>
        </button>
      ))}
    </div>
  );
}
