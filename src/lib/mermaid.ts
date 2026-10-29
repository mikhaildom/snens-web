/**
 * Фенсы `mermaid`: разрезать текст ответа на markdown и схемы.
 *
 * Режем ДО markdown-разбора — по той же причине, что и артефакты
 * (`lib/artifact.ts`): текст разбирается markdown-it, а на месте схемы встаёт
 * React-компонент, который умеет перерисовываться по ходу стрима. Если бы схему
 * рендерил рендерер фенсов, она была бы статичной строкой HTML и на каждом
 * токене собиралась бы заново вместе со всем сообщением.
 *
 * Язык фенса не обязателен: модель регулярно пишет просто ```` ``` ````, а тело
 * начинает с `graph TD`. Такой фенс распознаётся по первой строке тела — иначе
 * схема оставалась бы кодом, что человек и видел вживую.
 *
 * Модуль без React: правила проверяются `npm test`.
 */

/** Кусок текста: обычный markdown или схема. */
export type MermaidSegment =
  | { kind: "text"; text: string }
  /** `open: true` — фенс ещё не закрыт, модель печатает: схема рисуется по частям. */
  | { kind: "mermaid"; code: string; open: boolean };

/** Открывающая строка любого фенса: до трёх пробелов, три и более бэктика/тильды. */
const OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Первое слово тела — вид диаграммы. Список ведёт `mermaid`; здесь только
 * настоящие ключевые слова, чтобы болтливый код-фенс без языка не притворился
 * схемой.
 */
const KINDS = new Set([
  "graph",
  "flowchart",
  "sequencediagram",
  "classdiagram",
  "statediagram",
  "statediagram-v2",
  "erdiagram",
  "gantt",
  "pie",
  "journey",
  "mindmap",
  "timeline",
  "quadrantchart",
  "gitgraph",
  "c4context",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "requirementdiagram",
  "packet-beta",
  "architecture-beta",
  "kanban",
]);

/** Похоже ли тело на mermaid: первая значимая строка начинается с вида диаграммы. */
export function looksLikeMermaid(body: string): boolean {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    return KINDS.has(line.split(/\s+/)[0]?.toLowerCase() ?? "");
  }
  return false;
}

/** Закрывающая строка: тот же символ, не короче открывающего, больше ничего. */
function closesAt(line: string, marker: string, len: number): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return Boolean(m && m[1][0] === marker && m[1].length >= len);
}

/**
 * Порезать текст на сегменты: markdown между фенсами и схемы mermaid.
 *
 * Чужой фенс целиком уходит в текст: иначе ```` ```mermaid ```` внутри примера
 * кода вырезался бы и рисовался диаграммой.
 */
export function splitMermaid(source: string): MermaidSegment[] {
  const lines = source.split("\n");
  const out: MermaidSegment[] = [];
  let text: string[] = [];
  const flush = () => {
    const joined = text.join("\n");
    if (joined.trim()) out.push({ kind: "text", text: joined });
    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]);
    if (!open) {
      text.push(lines[i]);
      continue;
    }
    const marker = open[1][0];
    const len = open[1].length;
    const lang = (open[2].trim().split(/\s+/)[0] ?? "").toLowerCase();
    const body: string[] = [];
    let closed = false;
    let close = i + 1;
    for (; close < lines.length; close++) {
      if (closesAt(lines[close], marker, len)) {
        closed = true;
        break;
      }
      body.push(lines[close]);
    }
    const code = body.join("\n");
    const mermaid = lang === "mermaid" || (lang === "" && looksLikeMermaid(code));
    if (!mermaid) {
      for (let k = i; k <= Math.min(close, lines.length - 1); k++) text.push(lines[k]);
      i = close;
      continue;
    }
    flush();
    out.push({ kind: "mermaid", code, open: !closed });
    i = close;
  }
  flush();
  return out;
}
