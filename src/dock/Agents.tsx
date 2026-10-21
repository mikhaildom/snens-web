import type { SessionInfo } from "../api";
import { relTime } from "../lib/time";
import { agentStatus } from "../lib/agent";

/**
 * Подагенты: сессии с `parent`. Ядро отдаёт их списком, отдельной ручки нет —
 * фильтруем по полю. Клик открывает сессию подагента как обычную (с записью в
 * историю браузера — назад возвращает к родителю).
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
  //
  // Если открыт сам подагент, показываем его братьев: это его рабочая группа,
  // и человеку нужен способ перескочить на соседнюю задачу, не возвращаясь.
  const current = sessions.find((s) => s.id === active);
  const owner = current?.parent ?? active;
  const roots = owner ? sessions.filter((s) => s.parent === owner) : [];
  const running = roots.filter((s) => s.state === "running" && !s.done).length;

  if (!active) return <div className="dock__empty">сессия не выбрана.</div>;
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
        <span>{current?.parent ? "братья по родителю" : "подагенты этой сессии"}</span>
        <span className="agents__count">
          {running > 0 ? `${running} работает · ` : ""}
          {roots.length}
        </span>
      </div>
      {roots.map((s) => {
        const st = agentStatus(s);
        return (
          <button
            key={s.id}
            className="agents__row"
            aria-current={active === s.id}
            onClick={() => onPick(s.id)}
            title={`${s.id} · ${s.model ?? "—"}`}
          >
            <span className="agents__state" data-kind={st.kind} />
            <span className="agents__title">{s.title || s.id.slice(0, 8)}</span>
            <span className="agents__meta">
              <span className="agents__status" data-kind={st.kind}>
                {st.text}
              </span>
              <span className="agents__time">{relTime(s.updated_at)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
