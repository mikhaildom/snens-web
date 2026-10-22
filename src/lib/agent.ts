import type { SessionInfo } from "../api";
import { stepsWord } from "./format.ts";

/** Состояние подагента для точки, подписи и сортировки. */
export type AgentKind = "run" | "ok" | "err" | "idle";

export interface AgentStatus {
  text: string;
  kind: AgentKind;
  /** Сколько работал/работает, мс; пусто — не из чего считать. */
  workedMs?: number;
}

/**
 * Длительность работы подагента: от первой записи журнала до `Done`, а у живого —
 * до «сейчас».
 *
 * `now` передаётся снаружи (секунды unix): подпись перерисовывается по таймеру, а
 * правило остаётся чистым и проверяется тестом без подмены системных часов.
 */
export function workedMs(s: SessionInfo, now: number): number | undefined {
  const from = s.started_at;
  if (!from) return undefined;
  const to = s.done_at ?? now;
  // Часы могли разъехаться (логи с другого хоста) — отрицательное не показываем.
  return Math.max(0, (to - from) * 1000);
}

/**
 * Строка статуса подагента. Состояние берётся из `state` (его ведёт ядро: жив
 * процесс или нет) и `done` (чем кончился журнал); клиент их не переизобретает.
 */
export function agentStatus(s: SessionInfo, now: number): AgentStatus {
  const turns = s.turns ?? 0;
  const moves = `${turns} ${stepsWord(turns)}`;
  const worked = workedMs(s, now);

  if (s.state === "running") {
    return { text: `работает · ${moves}`, kind: "run", workedMs: worked };
  }
  if (s.state === "failed" || (s.done && s.done !== "ok")) {
    // У лимита ходов своё имя: это не поломка, а исчерпанный потолок — человеку
    // важно видеть, что работа встала по настройке, а не сломалась.
    const why = s.done === "limit" ? "лимит ходов" : s.done || s.state;
    return { text: `остановлен · ${why} · ${moves}`, kind: "err", workedMs: worked };
  }
  if (s.state === "interrupted") {
    return { text: `прерван · ${moves}`, kind: "err", workedMs: worked };
  }
  if (s.done === "ok") {
    return { text: `готов · ${moves}`, kind: "ok", workedMs: worked };
  }
  return { text: `ждёт · ${moves}`, kind: "idle", workedMs: worked };
}

export interface AgentNode {
  session: SessionInfo;
  /** Дети этого подагента: подагенты любой глубины, а не только первого уровня. */
  children: AgentNode[];
  depth: number;
}

/**
 * Иерархия подагентов: подагент может запустить своего подагента, и в интерфейсе
 * связь должна быть видна, а не сплющена в один список.
 *
 * `root` — сессия, чьё дерево строим: её прямые дети — корни, их дети —
 * следующий уровень. Цепочка любой глубины, порядок — как в списке (свежие
 * сверху). Цикл (порченые метаданные) обрывается: узел уже в дереве — не
 * повторяем, иначе рендер уходит в рекурсию.
 */
export function agentTree(sessions: SessionInfo[], root: string): AgentNode[] {
  const byParent = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    if (!s.parent) continue;
    const list = byParent.get(s.parent) ?? [];
    list.push(s);
    byParent.set(s.parent, list);
  }
  const seen = new Set<string>();
  const build = (parent: string, depth: number): AgentNode[] =>
    (byParent.get(parent) ?? [])
      .filter((s) => !seen.has(s.id))
      .map((s) => {
        seen.add(s.id);
        return { session: s, depth, children: build(s.id, depth + 1) };
      });
  return build(root, 0);
}

/**
 * Хозяин списка подагентов для выбранной сессии: если открыт сам подагент —
 * его родитель, иначе он сам. Нужен, чтобы в доке всегда была рабочая группа
 * (братья), а не пустота на подагенте.
 */
export function agentOwner(sessions: SessionInfo[], active: string | null): string | null {
  if (!active) return null;
  const current = sessions.find((s) => s.id === active);
  return current?.parent ?? active;
}

/** Сколько подагентов в дереве работает — для счётчика в заголовке дока. */
export function runningIn(nodes: AgentNode[]): number {
  return nodes.reduce(
    (n, x) => n + (x.session.state === "running" ? 1 : 0) + runningIn(x.children),
    0,
  );
}

/** Все узлы деревом-плоско, в порядке обхода: для списков и подсчётов. */
export function flatten(nodes: AgentNode[]): AgentNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
