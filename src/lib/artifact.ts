/**
 * Фенс `artifact`: интерактивный интерфейс внутри ответа модели.
 *
 * Грамматика — `snens/docs/artifact.md`, и она нарочно минимальна: заголовок
 * `ключ=значение` в одну строку плюс тело как есть. Причина не в лени, а в том,
 * что парсеров два (здесь и в туле `genui` на Rust), общей библиотеки между
 * ними нет, и сложную грамматику пришлось бы синхронизировать вручную.
 *
 * Модуль без React: правила проверяются `npm test`, а не скриншотами.
 */

/** Заголовок фенса: то, что модель написала до первого перевода строки. */
export interface ArtifactHead {
  id: string;
  src: string;
  net: string[];
  height: number;
  /** Все ключи как есть — для отчёта `genui check` и подписи в шапке. */
  raw: Record<string, string>;
}

export interface Artifact {
  /** Имя для ссылок и для «ответа на артефакт». Пусто — анонимный, имя даёт позиция. */
  id: string;
  head: ArtifactHead;
  /** Тело фенса; при `src` пусто. */
  body: string;
  /** Фенс ещё не закрыт: модель печатает. */
  open: boolean;
  /** Номер ревизии внутри сообщения: повтор с тем же `id` — правка. */
  rev: number;
  /** Сколько байт тела: этим живёт подпись «рисует · 61 строка · 3.1 КБ». */
  bytes: number;
}

/** Кусок текста ответа: обычный markdown или артефакт. */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "artifact"; art: Artifact };

/** Открывающая строка фенса: три и более бэктика + инфо-строка `artifact`. */
const OPEN = /^ {0,3}(`{3,})artifact(?:[ \t]+(.*))?[ \t]*$/;
const CLOSE = /^ {0,3}(`{3,})[ \t]*$/;

const NET_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Разобрать заголовок: токены `ключ=значение` через пробелы.
 *
 * Неизвестный ключ не игнорируется молча: опечатка (`nt=`) иначе означала бы
 * «сети нет», и артефакт молча не грузил бы данные. Возвращаем их отдельно,
 * чтобы клиент показал, а `check` — отказал.
 */
export function parseHead(line: string): { head: ArtifactHead; unknown: string[] } {
  const raw: Record<string, string> = {};
  const unknown: string[] = [];
  for (const token of line.trim().split(/\s+/).filter(Boolean)) {
    const eq = token.indexOf("=");
    if (eq <= 0) {
      unknown.push(token);
      continue;
    }
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1);
    raw[key] = value;
    if (!["id", "src", "net", "height", "lib"].includes(key)) unknown.push(key);
  }
  const height = Number(raw.height);
  return {
    head: {
      id: raw.id && /^[A-Za-z0-9._-]+$/.test(raw.id) ? raw.id : "",
      src: raw.src ?? "",
      net: (raw.net ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => NET_NAME.test(s)),
      // Высота — подсказка, а не приказ: 0 значит «по содержимому».
      height: Number.isFinite(height) && height >= 80 && height <= 4000 ? Math.round(height) : 0,
      raw,
    },
    unknown,
  };
}

/**
 * Порезать текст ответа на сегменты: markdown между фенсами и артефакты.
 *
 * Незакрытый фенс (модель ещё печатает) — тоже артефакт, с `open: true`, а не
 * остаток текста: иначе человек видел бы кусок HTML как код и решил, что модель
 * сломалась.
 */
export function splitArtifacts(source: string): Segment[] {
  const lines = source.split("\n");
  const out: Segment[] = [];
  const seen = new Map<string, number>();
  let text: string[] = [];
  const flushText = () => {
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
    const fence = open[1].length;
    const { head, unknown } = parseHead(open[2] ?? "");
    const body: string[] = [];
    let closed = false;
    let close = i + 1;
    for (; close < lines.length; close++) {
      const c = CLOSE.exec(lines[close]);
      if (c && c[1].length >= fence) {
        closed = true;
        break;
      }
      body.push(lines[close]);
    }
    // Неизвестные токены заголовка сохраняем в raw: `genui check` по ним ругается.
    for (const key of unknown) head.raw[`?${key}`] = "";
    const joined = body.join("\n");
    const id = head.id || `#${out.filter((s) => s.kind === "artifact").length + 1}`;
    const rev = (seen.get(id) ?? 0) + 1;
    seen.set(id, rev);
    flushText();
    out.push({
      kind: "artifact",
      art: { id, head, body: joined, open: !closed, rev, bytes: joined.length },
    });
    i = close;
  }
  flushText();
  return out;
}

/**
 * Свернуть ревизии: остаётся последняя версия каждого `id`, но с `rev` —
 * чтобы шапка сказала «правка 2», а не показала два одинаковых блока.
 *
 * Порядок — по первой позиции `id`: артефакт не прыгает вниз, когда модель его
 * правит (это то же правило, что у блока тула: позиция фиксируется на первом
 * появлении).
 */
export function latestArtifacts(segs: Segment[]): Segment[] {
  const last = new Map<string, Artifact>();
  for (const s of segs) if (s.kind === "artifact") last.set(s.art.id, s.art);
  // Текст между фенсами остаётся на своих местах: выбрасывается только ПОВТОР
  // ревизии, иначе ответ модели после артефакта пропадал бы целиком.
  const seen = new Set<string>();
  const out: Segment[] = [];
  for (const s of segs) {
    if (s.kind === "text") {
      out.push(s);
      continue;
    }
    if (seen.has(s.art.id)) continue;
    seen.add(s.art.id);
    out.push({ kind: "artifact", art: last.get(s.art.id) ?? s.art });
  }
  return out;
}

/**
 * Приватная сеть и локальные имена: запрещены всегда, независимо от `net=`.
 * Список — часть контракта (`docs/artifact.md`), дублируется в `genui check`:
 * клиент обязан отказать даже если проверку обошли.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "[::1]") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** Домены, которые реально попадут в CSP: приватные выкинуты, а не «предупреждены». */
export function allowedNets(head: ArtifactHead): string[] {
  return head.net.filter((h) => !isPrivateHost(h) && !h.includes(":"));
}

/** `connect-src` артефакта: перечисленные домены или запрет. */
export function connectSrc(head: ArtifactHead): string {
  const nets = allowedNets(head);
  return nets.length ? nets.map((h) => `https://${h}`).join(" ") : "'none'";
}

/**
 * Политика содержимого для srcdoc.
 *
 * `script-src 'unsafe-inline'` — потому что тело фенса и есть документ: внешний
 * `<script src>` разрешён только с домена из `net=`, иначе он молча грузился бы
 * мимо объявленного намерения.
 */
export function artifactCsp(head: ArtifactHead, scripts: boolean): string {
  const nets = allowedNets(head);
  const scriptSrc = scripts
    ? `'unsafe-inline'${nets.length ? ` ${nets.map((h) => `https://${h}`).join(" ")}` : ""}`
    : "'none'";
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src https: data: blob:",
    "font-src data:",
    "media-src data: blob:",
    `script-src ${scriptSrc}`,
    `connect-src ${connectSrc(head)}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}
