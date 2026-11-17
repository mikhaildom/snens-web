import { useEffect, useState } from "react";
import type { SessionInfo } from "../api";
import { relTime, worked } from "../lib/time";
import { agentStatus, agentTree, agentOwner, runningIn, type AgentNode } from "../lib/agent";

/**
 * Подагенты: сессии с `parent`, выстроенные в дерево — подагент может запустить
 * своего подагента, и связь должна быть видна, а не сплющена в один список.
 *
 * Клик открывает сессию подагента как обычную (с записью в историю браузера —
 * «назад» возвращает к родителю).
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
  // Время работы растёт, пока подагент работает: перерисовываем подписи раз в
  // секунду, пока в дереве есть живые. Это единственный таймер дока — список
  // сессий приходит потоком, опроса нет.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  // «Окна» — про выбранную сессию: показываем её подагентов. Если открыт сам
  // подагент — его братьев: это его рабочая группа, и человеку нужен способ
  // перескочить на соседнюю задачу, не возвращаясь к родителю.
  const owner = agentOwner(sessions, active);
  const tree = owner ? agentTree(sessions, owner) : [];
  const running = runningIn(tree);
  const current = sessions.find((s) => s.id === active);

  useEffect(() => {
    if (running === 0) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!active) return <div className="dock__empty">Выбери сессию слева</div>;
  if (tree.length === 0) return <div className="dock__empty">В этой сессии подагентов нет</div>;
  return (
    <div className="agents">
      <div className="agents__filter">
        <span>{current?.parent ? "Рабочая группа" : "Подагенты этой сессии"}</span>
        <span className="agents__count">{running > 0 ? `Работают: ${running}` : ""}</span>
      </div>
      {tree.map((node) => (
        <AgentRow key={node.session.id} node={node} active={active} now={now} onPick={onPick} />
      ))}
    </div>
  );
}

/** Узел дерева: глубина — отступом, дети — вложенными строками того же вида. */
function AgentRow({
  node,
  active,
  now,
  onPick,
}: {
  node: AgentNode;
  active: string | null;
  now: number;
  onPick: (id: string) => void;
}) {
  const s = node.session;
  const st = agentStatus(s, now);
  // «3м 12с» у работающего, «заняло 3м 12с» у закрытого — по одному полю, но
  // читаются они по-разному, и путать их нельзя.
  const span = st.workedMs ? worked(st.workedMs) : "";
  return (
    <>
      <button
        className="agents__row"
        data-depth={node.depth}
        aria-current={active === s.id}
        onClick={() => onPick(s.id)}
        title={`${s.id}, ${s.model ?? "модель по умолчанию"}`}
      >
        <span className="agents__state" data-kind={st.kind} />
        <span className="agents__title">{s.title || s.id.slice(0, 8)}</span>
        <span className="agents__meta">
          <span className="agents__status" data-kind={st.kind}>
            {st.text}
          </span>
          {span && (
            <span className="agents__worked" title={s.state === "running" ? "работает" : "заняло"}>
              {span}
            </span>
          )}
          <span className="agents__time">{relTime(s.updated_at)}</span>
        </span>
      </button>
      {node.children.map((child) => (
        <AgentRow key={child.session.id} node={child} active={active} now={now} onPick={onPick} />
      ))}
    </>
  );
}
