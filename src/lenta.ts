/**
 * Лента хода: единственное место, где решается порядок блоков.
 *
 * Раньше порядок собирался в трёх независимых представлениях (`stream` двумя
 * строками, словарь `liveTools`, массив `msgs`) и на каждом шаге модели
 * перетасовывался: текст склеивался в один абзац, тулы уезжали вниз, reasoning
 * вырастал сверху. Здесь оно одно: массив блоков, вставка один раз, ключ
 * порядка — `seq` события (ядро отдаёт его монотонным и без дыр).
 *
 * Модуль нарочно без React: правила проверяются тестами (`npm test`), а не
 * скриншотами.
 */
import type { Part, SurfaceEvent, ToolCall, TranscriptMessage } from "./api";

export interface ToolRun {
  callId: string;
  name: string;
  args: string;
  state: "running" | "ok" | "error";
  exit?: number;
  preview: string;
  ms?: number;
  started?: number;
  parts?: Part[];
  ts?: number;
}

/** Элемент живой ленты: то, что уже пришло стримом, в хронологическом порядке. */
export type LiveItem =
  | { kind: "text"; seq: number; text: string }
  | { kind: "reasoning"; seq: number; text: string }
  | { kind: "tool"; seq: number; tool: ToolRun };

/**
 * Событие стрима → живая лента. Дельта приклеивается к последнему блоку, только
 * если он того же вида; иначе открывается новый блок — поэтому рассуждения
 * разных шагов не сливаются в одну простыню, а текст, написанный до вызова
 * инструмента, остаётся на своём месте, а не под тулом.
 */
export function applyEvent(items: LiveItem[], e: SurfaceEvent): LiveItem[] {
  const seq = Number(e.seq ?? 0);
  const last = items[items.length - 1];
  switch (e.type) {
    case "assistant.delta": {
      const text = String(e.text ?? "");
      const kind = e.kind === "reasoning" ? "reasoning" : "text";
      if (last && last.kind === kind) {
        return [...items.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...items, { kind, seq, text }];
    }
    case "tool.started": {
      const callId = String(e.call_id ?? "");
      return [
        ...items,
        {
          kind: "tool",
          seq,
          tool: {
            callId,
            name: String(e.name ?? "tool"),
            args: String(e.args ?? ""),
            state: "running",
            preview: "",
            started: Date.now(),
          },
        },
      ];
    }
    case "tool.completed": {
      // Результат обновляет свой блок, но не двигает его: позиция зафиксирована
      // на `tool.started`.
      const callId = String(e.call_id ?? "");
      const exit = Number(e.exit ?? 0);
      return items.map((it) => {
        if (it.kind !== "tool" || it.tool.callId !== callId) return it;
        return {
          ...it,
          tool: {
            ...it.tool,
            name: it.tool.name || String(e.name ?? "tool"),
            state: exit === 0 ? "ok" : "error",
            exit,
            preview: String(e.preview ?? ""),
            ms: it.tool.started ? Date.now() - it.tool.started : undefined,
          },
        };
      });
    }
    default:
      return items;
  }
}

/** Часть свёрнутой пачки: шаг без текста (рассуждение, отчёт подагента) или вызов. */
export type FoldPart =
  | { kind: "msg"; m: TranscriptMessage; tools: ToolRun[] }
  | { kind: "tool"; t: ToolRun };

export type Block =
  | { kind: "user"; m: TranscriptMessage }
  | { kind: "say"; m: TranscriptMessage }
  | { kind: "fold"; parts: FoldPart[] }
  /** Справка долгой памяти перед ходом, который её получил (по галочке в настройках). */
  | { kind: "recall"; m: TranscriptMessage };

/**
 * Тулы из журнала: вызов и его результат — один ToolRun.
 * Живые тулы (`live`) перекрывают журнальные по `call_id`: у них есть
 * промежуточное состояние, которого в лог ещё нет.
 */
export function collectTools(
  msgs: TranscriptMessage[],
  live: LiveItem[],
  hasSession: boolean,
): ToolRun[] {
  // Без выбранной сессии тулов нет: иначе при «новой сессии» док показывал бы
  // вызовы предыдущей, пока её история ещё лежит в состоянии.
  if (!hasSession) return [];
  const out: ToolRun[] = [];
  const byId = new Map<string, ToolRun>();
  for (const m of msgs) {
    if (m.role === "assistant") {
      for (const c of m.tool_calls ?? []) {
        const t: ToolRun = {
          callId: c.id,
          name: c.function.name,
          args: c.function.arguments,
          state: "running",
          preview: "",
        };
        out.push(t);
        byId.set(c.id, t);
      }
    }
    if (m.role === "tool" && m.tool_call_id) {
      const t = byId.get(m.tool_call_id);
      const exit = m.exit ?? 0;
      if (t) {
        t.state = exit === 0 ? "ok" : "error";
        t.exit = exit;
        t.preview = m.content ?? "";
        t.ms = m.ms;
        t.parts = m.parts;
        t.ts = m.ts;
        if (m.name) t.name = m.name;
      } else {
        // Результат без вызова (оборванный ход): показываем как есть, а не теряем.
        out.push({
          callId: m.tool_call_id,
          name: m.name ?? "tool",
          args: "",
          state: exit === 0 ? "ok" : "error",
          exit,
          preview: m.content ?? "",
          ms: m.ms,
          parts: m.parts,
          ts: m.ts,
        });
      }
    }
  }
  for (const it of live) {
    if (it.kind !== "tool") continue;
    const idx = out.findIndex((x) => x.callId === it.tool.callId);
    if (idx >= 0) out[idx] = it.tool;
    else out.push(it.tool);
  }
  return out;
}

/**
 * Раскладка ленты. На виду остаются реплика человека, текст модели (в том числе
 * промежуточный — это её completion, а не служебный шаг) и финальный ответ.
 * В свёрнутую пачку уезжает только выполнение инструментов и шаги без текста:
 * рассуждение, вызовы без реплики, отчёты подагентов. Пачка вставляется на своё
 * место в хронологии, поэтому вокруг одного хода их может быть несколько.
 */
export function buildBlocks(msgs: TranscriptMessage[], tools: ToolRun[]): Block[] {
  const bySeq = new Map<number, ToolRun[]>();
  const byCall = new Map<string, ToolRun>();
  for (const t of tools) byCall.set(t.callId, t);
  for (const m of msgs) {
    if (m.role === "assistant") {
      const list = (m.tool_calls ?? [])
        .map((c: ToolCall) => byCall.get(c.id))
        .filter((t): t is ToolRun => Boolean(t));
      bySeq.set(m.seq, list);
    }
  }

  const out: Block[] = [];
  let fold: FoldPart[] = [];
  const flushFold = () => {
    if (fold.length === 0) return;
    out.push({ kind: "fold", parts: fold });
    fold = [];
  };

  for (const m of msgs) {
    // Справка памяти — отдельная серая строка на своём месте в хронологии:
    // она лежит в логе перед ходом, который её получил, и к репликам не относится.
    if (m.role === "recall") {
      flushFold();
      out.push({ kind: "recall", m });
      continue;
    }
    if (m.role === "user") {
      // Вставка в ход от подагента (`report`/`ask`) — часть работы, а не реплика
      // человека: уезжает в текущую пачку. Сообщение самого человека и его же
      // steer (`via: "steer"`) остаются репликами.
      if (m.via === "report" || m.via === "ask") {
        fold.push({ kind: "msg", m, tools: [] });
        continue;
      }
      flushFold();
      out.push({ kind: "user", m });
      continue;
    }
    if (m.role !== "assistant") continue; // результаты тулов живут внутри ToolRun
    // Рассуждение хронологически идёт ДО текста своего шага: в пачку, потом текст.
    if (m.reasoning) {
      fold.push({
        kind: "msg",
        m: { ...m, content: null, tool_calls: undefined, usage: undefined },
        tools: [],
      });
    }
    if (m.content && m.content.trim()) {
      flushFold();
      out.push({ kind: "say", m });
    }
    for (const t of bySeq.get(m.seq) ?? []) fold.push({ kind: "tool", t });
  }
  flushFold();
  return out;
}
