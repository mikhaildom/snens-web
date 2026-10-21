import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  subscribe,
  uuid,
  type Part,
  type SessionInfo,
  type SurfaceEvent,
  type SearchHit,
  type ToolCall,
  type TranscriptMessage,
  type Usage,
  type WindowBreakdown,
} from "./api";
import { Markdown } from "./markdown";
import { applyTheme, initialTheme, type Theme } from "./theme";
import { useResize } from "./useResize";

type DockTab = "windows" | "tools";

interface ToolRun {
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

interface Approval {
  id: string;
  command: string;
  cwd: string;
}

const time = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const dur = (ms?: number) => (ms == null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

/** «только что / 12 мин / 3 ч / вчера / 21 окт». */
function relTime(ts?: number): string {
  if (!ts) return "";
  const now = Date.now() / 1000;
  const d = Math.max(0, now - ts);
  if (d < 60) return "только что";
  if (d < 3600) return `${Math.floor(d / 60)} мин`;
  const date = new Date(ts * 1000);
  const hm = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `${Math.floor(d / 3600)} ч`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `вчера ${hm}`;
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** «1 шаг / 2 шага / 5 шагов». */
function stepsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "шаг";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "шага";
  return "шагов";
}

/** Аргументы вызова одной строкой: разбираем JSON, но не падаем на не-JSON. */
function shortArgs(raw: string): string {
  try {
    const v = JSON.parse(raw);
    const first = v.cmd ?? v.path ?? v.url ?? v.query ?? v.args?.[0] ?? v.text ?? Object.values(v)[0];
    const s = Array.isArray(first) ? first.join(" ") : String(first ?? "");
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  } catch {
    return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
  }
}

/**
 * Пути, которые смотрел `view`. Тул получает их массивом в `args`, и в ленте
 * нужны именно пути: argv вида `{"args": ["/a.png", "/b.png"]}` и служебная
 * строка «→ вложение» модели ничего не говорят.
 */
function viewedPaths(t: ToolRun): string[] {
  if (t.name !== "view") return [];
  try {
    const v = JSON.parse(t.args);
    const raw = Array.isArray(v) ? v : (v.args ?? v.paths ?? []);
    return (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
  } catch {
    return [];
  }
}

const MEDIA_TOOLS = new Set(["view"]);

/** Лимит окна для шкалы контекста: у сессии он свой, у поверхности — дефолт. */
const CTX_LIMIT = 1_000_000;

const fileUrl = (session: string, path: string) =>
  `/api/v1/sessions/${session}/file?path=${encodeURIComponent(path)}`;

/* ── лента ──────────────────────────────────────────────── */

/** Полноэкранный просмотр картинки: без растягивания, с листанием. */
function Lightbox({
  session,
  parts,
  index,
  onIndex,
  onClose,
}: {
  session: string;
  parts: Part[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const part = parts[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % parts.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + parts.length) % parts.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, onClose, onIndex, parts.length]);
  if (!part) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lightbox__bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox__name">{part.path.split("/").pop()}</span>
        <span className="lightbox__dim">
          {part.width && part.height ? `${part.width}×${part.height}` : ""}
          {parts.length > 1 ? ` · ${index + 1}/${parts.length}` : ""}
        </span>
        <a className="lightbox__file" href={fileUrl(session, part.path)} target="_blank" rel="noreferrer">
          файл
        </a>
        <button className="lightbox__close" onClick={onClose} aria-label="закрыть">
          ×
        </button>
      </div>
      <img
        className="lightbox__img"
        src={fileUrl(session, part.path)}
        alt={part.path.split("/").pop() ?? "image"}
        onClick={(e) => e.stopPropagation()}
      />
      {parts.length > 1 && (
        <>
          <button
            className="lightbox__nav lightbox__nav--prev"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + parts.length) % parts.length);
            }}
            aria-label="предыдущая"
          >
            ‹
          </button>
          <button
            className="lightbox__nav lightbox__nav--next"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % parts.length);
            }}
            aria-label="следующая"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Вложения, которые можно увидеть и услышать. Картинки — то, что смотрел агент
 * (`view`) или что приложил человек; голосовые — с проигрыванием, потому что
 * распознавание живёт в ядре, а исходник нужно уметь переслушать.
 *
 * Картинки одного вызова идут одной строкой (при нехватке места — свайпом),
 * открываются во весь экран: пропорции сохраняются, ничего не растягивается.
 */
function Attachments({ session, parts }: { session: string; parts?: Part[] }) {
  const visual = (parts ?? []).filter((p) => p.kind === "image" || p.kind === "video");
  const images = visual.filter((p) => p.kind === "image");
  const audio = (parts ?? []).filter((p) => p.kind === "audio");
  const [shot, setShot] = useState<number | null>(null);
  if (visual.length === 0 && audio.length === 0) return null;
  return (
    <>
      <div className="shots">
        {visual.map((p) =>
          p.kind === "image" ? (
            <button
              key={p.path}
              className="shot"
              onClick={() => setShot(images.indexOf(p))}
              title={`${p.path}${p.width ? ` · ${p.width}×${p.height}` : ""}`}
            >
              <img
                src={fileUrl(session, p.path)}
                alt={p.path.split("/").pop() ?? "image"}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).closest(".shot")!.remove();
                }}
              />
            </button>
          ) : (
            <video key={p.path} src={fileUrl(session, p.path)} controls preload="metadata" />
          ),
        )}
      </div>
      {audio.map((p) => (
        <figure className="voice" key={p.path}>
          <audio src={fileUrl(session, p.path)} controls preload="metadata" />
          <figcaption>
            {p.kind === "audio" ? "голосовое" : p.kind} · {(p.bytes / 1024).toFixed(0)} КБ
          </figcaption>
        </figure>
      ))}
      {shot != null && (
        <Lightbox
          session={session}
          parts={images}
          index={shot}
          onIndex={setShot}
          onClose={() => setShot(null)}
        />
      )}
    </>
  );
}

const MARK: Record<ToolRun["state"], string> = { ok: "✓", error: "×", running: "●" };

function ToolBlock({ t, session, defaultOpen }: { t: ToolRun; session: string; defaultOpen?: boolean }) {
  // Тул с медиа раскрыт сразу: смысл вложения — увидеть, что смотрел агент,
  // а не разворачивать блок руками.
  const hasMedia = Boolean(
    t.parts?.some((p) => p.kind === "image" || p.kind === "video" || p.kind === "audio"),
  );
  const paths = viewedPaths(t);
  // У медиа-тулов argv и служебный вывод не показываем: они дублируют то, что
  // и так видно — картинки и их пути.
  const quiet = MEDIA_TOOLS.has(t.name) && (paths.length > 0 || hasMedia);
  const [open, setOpen] = useState(!!defaultOpen || hasMedia || quiet);
  return (
    <div className="tool" data-state={t.state}>
      <button className="tool__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="tool__mark">{MARK[t.state]}</span>
        <span className="tool__name">{t.name}</span>
        <span className="tool__arg">
          {paths.length > 0 ? paths.map((p) => p.split("/").pop()).join(", ") : shortArgs(t.args)}
        </span>
        <span className="tool__meta">
          {t.exit != null && t.exit !== 0 ? `exit ${t.exit}` : ""}
          {t.ms != null && <span className="tool__ms">{dur(t.ms)}</span>}
          {t.ts != null && <time>{time(t.ts)}</time>}
        </span>
      </button>
      {open && (
        <div className="tool__body">
          {quiet ? (
            paths.length > 0 && (
              <ul className="tool__paths">
                {paths.map((p) => (
                  <li key={p} title={p}>
                    {p}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {t.args && <pre className="code">{t.args}</pre>}
              {t.preview && <pre className="code tool__out">{t.preview}</pre>}
            </>
          )}
          <Attachments session={session} parts={t.parts} />
        </div>
      )}
    </div>
  );
}

function Reasoning({ text }: { text: string }) {
  return (
    <details className="reasoning">
      <summary>reasoning</summary>
      <div>{text}</div>
    </details>
  );
}

/**
 * Расход хода: кеш-хит (с иконкой базы), кеш-мисс/выход и цена. Всё, кроме
 * иконки с процентом, выводится целиком, но появляется только при ховере на
 * сообщение или шаг (см. `.usage` в CSS): в спокойном чтении цифры не нужны.
 */
function UsageBar({ u }: { u: Usage }) {
  const hit = u.in_tok > 0 ? Math.round((u.cached_tok / u.in_tok) * 100) : 0;
  const miss = u.in_tok - u.cached_tok;
  const cost = u.cost_micro / 1_000_000;
  return (
    <span
      className="usage"
      title={[
        `вход ${u.in_tok.toLocaleString("ru-RU")}`,
        `кеш ${u.cached_tok.toLocaleString("ru-RU")}`,
        `кеш-мисс ${miss.toLocaleString("ru-RU")}`,
        `выход ${u.out_tok.toLocaleString("ru-RU")}`,
        u.reason_tok > 0 ? `reasoning ${u.reason_tok.toLocaleString("ru-RU")}` : "",
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <span className="usage__hit">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" className="usage__db">
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
          <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
        </svg>
        {hit}%
      </span>
      <span className="usage__dim">
        {miss}/{u.out_tok}
      </span>
      {u.reason_tok > 0 && <span className="usage__dim">r{u.reason_tok}</span>}
      <span className="usage__cost">${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}</span>
    </span>
  );
}

/** Один шаг модели: текст ответа, reasoning (свёрнут) и его вызовы тулов. */
function Step({
  m,
  tools,
  session,
}: {
  m: TranscriptMessage;
  tools: ToolRun[];
  session: string;
}) {
  const hasBody = Boolean(m.content) || tools.length > 0 || Boolean(m.reasoning);
  if (!hasBody) return null;
  // Вставка в ход: вопрос или отчёт подагента. Автор — по имени сессии, без
  // служебных префиксов в тексте.
  if (m.via === "report" || m.via === "ask") {
    return (
      <div className="step step--via">
        <header className="msg__head">
          <span className="who">{m.via === "ask" ? "вопрос" : "отчёт"}</span>
          <span>{m.from ? m.from.slice(0, 8) : "подагент"}</span>
          <time>{time(m.ts)}</time>
        </header>
        <div className="via__body">{m.content && <Markdown text={m.content} images={false} />}</div>
      </div>
    );
  }
  return (
    <div className="step">
      <header className="msg__head">
        <span className="who">snens</span>
        {tools.length > 0 && <span>{tools.length} тул.</span>}
        {m.usage && <UsageBar u={m.usage} />}
        <time>{time(m.ts)}</time>
      </header>
      {/* Хронология хода: сначала модель думает, потом пишет. */}
      {m.reasoning && <Reasoning text={m.reasoning} />}
      {m.content && <Markdown text={m.content} />}
      {tools.map((t) => (
        <ToolBlock key={t.callId} t={t} session={session} />
      ))}
    </div>
  );
}

function UserTurn({ m, session }: { m: TranscriptMessage; session: string }) {
  return (
    <article className="msg msg--user">
      <header className="msg__head">
        <span className="who">you</span>
        {m.source && m.source !== "surface" && <span>{m.source}</span>}
        <time>{time(m.ts)}</time>
      </header>
      <div className="msg__main">
        {m.content && <Markdown text={m.content} />}
        <Attachments session={session} parts={m.parts} />
      </div>
    </article>
  );
}

function Live({
  content,
  reasoning,
  tools,
  session,
}: {
  content: string;
  reasoning: string;
  tools: ToolRun[];
  session: string;
}) {
  if (!content && !reasoning && tools.length === 0) return null;
  return (
    <article className="msg msg--assistant msg--pending">
      <header className="msg__head">
        <span className="who">snens</span>
        <span>стрим</span>
      </header>
      <div className="msg__main">
        {reasoning && <Reasoning text={reasoning} />}
        {content && <Markdown text={content} />}
        {tools.map((t) => (
          <ToolBlock key={t.callId} t={t} session={session} defaultOpen={false} />
        ))}
      </div>
    </article>
  );
}

/**
 * Промежуточные шаги между сообщением человека и финальным ответом свёрнуты
 * в одну строку: «4 шага · 2 тула · 9.3s». Финальный ответ модели остаётся
 * видимым — он и есть результат хода.
 */
function Steps({
  steps,
  toolsByStep,
  session,
}: {
  steps: TranscriptMessage[];
  toolsByStep: Map<number, ToolRun[]>;
  session: string;
}) {
  const [open, setOpen] = useState(false);
  const toolCount = steps.reduce((n, m) => n + (toolsByStep.get(m.seq)?.length ?? 0), 0);
  const ms = steps.reduce(
    (n, m) => n + (toolsByStep.get(m.seq) ?? []).reduce((k, t) => k + (t.ms ?? 0), 0),
    0,
  );
  // Расход всей пачки: по нему видно, сколько стоил путь до ответа.
  const usage = steps.reduce<Usage | undefined>((acc, m) => {
    if (!m.usage) return acc;
    return {
      in_tok: (acc?.in_tok ?? 0) + m.usage.in_tok,
      cached_tok: (acc?.cached_tok ?? 0) + m.usage.cached_tok,
      out_tok: (acc?.out_tok ?? 0) + m.usage.out_tok,
      reason_tok: (acc?.reason_tok ?? 0) + m.usage.reason_tok,
      cost_micro: (acc?.cost_micro ?? 0) + m.usage.cost_micro,
    };
  }, undefined);
  // Отчёты подагентов (`via: "report"`) — не реплики модели: их место в
  // промежуточных шагах, а не на виду у человека.
  const reports = steps.filter((m) => m.via === "report").length;
  return (
    <section className="steps" data-open={open}>
      <button className="steps__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="steps__caret">{open ? "▾" : "▸"}</span>
        <span>
          {steps.length} {stepsWord(steps.length)}
        </span>
        {toolCount > 0 && <span className="steps__dim">{toolCount} тул.</span>}
        {reports > 0 && <span className="steps__dim">{reports} отчёт</span>}
        {ms > 0 && <span className="steps__dim">{dur(ms)}</span>}
        {usage && <UsageBar u={usage} />}
        <time>{time(steps[steps.length - 1].ts)}</time>
      </button>
      {open && (
        <div className="steps__body">
          {steps.map((m) => (
            <Step key={m.seq} m={m} tools={toolsByStep.get(m.seq) ?? []} session={session} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── док ────────────────────────────────────────────────── */

function ToolRow({ t, session }: { t: ToolRun; session: string }) {
  const hasMedia = Boolean(
    t.parts?.some((p) => p.kind === "image" || p.kind === "video" || p.kind === "audio"),
  );
  const [open, setOpen] = useState(hasMedia);
  return (
    <section className="win">
      <button className="win__bar" onClick={() => setOpen((v) => !v)}>
        <span className="win__kind">{MARK[t.state]}</span>
        <span>{t.name}</span>
        <span className="win__arg">
          {viewedPaths(t).length > 0
            ? viewedPaths(t).map((p) => p.split("/").pop()).join(", ")
            : shortArgs(t.args)}
        </span>
        <span className="win__state" data-state={t.state}>
          {t.ms != null ? dur(t.ms) : t.state}
        </span>
      </button>
      {open && (
        <div className="win__body">
          {MEDIA_TOOLS.has(t.name) && viewedPaths(t).length > 0 ? (
            <ul className="tool__paths">
              {viewedPaths(t).map((p) => (
                <li key={p} title={p}>
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <>
              {t.args && <pre>{t.args}</pre>}
              {t.preview && <pre>{t.preview}</pre>}
            </>
          )}
          <Attachments session={session} parts={t.parts} />
        </div>
      )}
    </section>
  );
}

function Dock({
  tab,
  setTab,
  tools,
  session,
  children,
  onClose,
}: {
  tab: DockTab;
  setTab: (t: DockTab) => void;
  tools: ToolRun[];
  session: string;
  children?: React.ReactNode;
  onClose?: () => void;
}) {
  const running = tools.filter((t) => t.state === "running").length;
  return (
    <>
      <div className="dock__tabs" role="tablist">
        <button role="tab" aria-selected={tab === "windows"} onClick={() => setTab("windows")}>
          окна
        </button>
        <button role="tab" aria-selected={tab === "tools"} onClick={() => setTab("tools")}>
          тулы <b>{tools.length}</b>
          {running ? <b className="live">{running}</b> : null}
        </button>
        {onClose && (
          <button className="dock__close" onClick={onClose} aria-label="закрыть док">
            ×
          </button>
        )}
      </div>
      <div className="dock__body" role="tabpanel">
        {tab === "windows" ? (
          children
        ) : tools.length === 0 ? (
          <div className="dock__empty">в этой сессии тулы ещё не звались.</div>
        ) : (
          tools.map((t) => <ToolRow key={t.callId} t={t} session={session} />)
        )}
      </div>
    </>
  );
}

/**
 * Окно контекста: расклад считает ядро (`GET /v1/sessions/{id}/context`) по той
 * же проекции промпта, что уедет провайдеру, и приводит к цифрам провайдера
 * калибровкой по прошлым ходам. Статьи — как в /context у Claude Code:
 * системный промпт, сообщения, вызовы тулов, их результаты, картинки.
 */
function ContextWindow({
  breakdown,
  limit,
}: {
  breakdown: WindowBreakdown | null;
  limit: number;
}) {
  if (!breakdown) {
    return (
      <div className="context">
        <div className="context__head">
          <b>окно</b>
          <span>нет данных</span>
        </div>
      </div>
    );
  }
  const b = breakdown;
  const pct = limit > 0 ? Math.min(100, (b.total / limit) * 100) : 0;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const all: Array<[string, number, string]> = [
    ["system", b.system, "системный промпт"],
    ["messages", b.messages, "сообщения"],
    ["toolCalls", b.tool_calls, "вызовы тулов"],
    ["toolResults", b.tool_results, "результаты тулов"],
    ["images", b.images, "картинки"],
  ];
  const segs = all.filter(([, n]) => n > 0);
  return (
    <div className="context">
      <div className="context__head">
        <b>
          {fmt(b.total)} / {fmt(limit)}
        </b>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div
        className="context__bar"
        title={segs.map(([, n, t]) => `${t} ${Math.round(n)}`).join(" · ")}
      >
        {segs.map(([kind, n]) => (
          <span
            key={kind}
            className="context__seg"
            data-kind={kind}
            style={{ width: `${limit > 0 ? (n / limit) * 100 : 0}%` }}
          />
        ))}
        <span className="context__seg" data-kind="free" />
      </div>
      <div className="context__legend">
        {segs.map(([kind, n, title]) => (
          <span key={kind} title={`${Math.round(n).toLocaleString("ru-RU")} токенов`}>
            <i data-kind={kind} />
            {title} {fmt(n)}
          </span>
        ))}
        <span>
          <i data-kind="free" />
          свободно {fmt(Math.max(0, limit - b.total))}
        </span>
      </div>
      <div className="context__foot">
        {b.messages_count} сообщ. · {b.tool_calls_count} вызовов
      </div>
    </div>
  );
}

/**
 * Подагенты: сессии с `parent`. Ядро отдаёт их списком, отдельной ручки нет —
 * фильтруем по полю. Клик открывает сессию подагента как обычную.
 */
function Agents({
  sessions,
  active,
  onPick,
}: {
  sessions: SessionInfo[];
  active: string | null;
  onPick: (id: string) => void;
}) {
  // «Окна» — про выбранную сессию: показываем только её подагентов. Список
  // подагентов в других сессиях — шум, у него есть сам rail и поиск.
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

/* ── тема ───────────────────────────────────────────────── */

function ThemeBar({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const items: Array<[Theme, string]> = [
    ["auto", "sys"],
    ["light", "lgt"],
    ["dark", "drk"],
  ];
  return (
    <div className="themebar" role="group" aria-label="theme">
      {items.map(([key, label]) => (
        <button
          key={key}
          aria-pressed={theme === key}
          title={`theme: ${key === "auto" ? "по системе" : key}`}
          onClick={() => setTheme(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── приложение ─────────────────────────────────────────── */

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  // Сессия живёт в URL: `?session=<id>`. Это даёт рабочую навигацию браузера
  // вперёд/назад и ссылку на конкретную сессию.
  const [active, setActive] = useState<string | null>(
    () => new URLSearchParams(location.search).get("session"),
  );
  const [msgs, setMsgs] = useState<TranscriptMessage[]>([]);
  const [stream, setStream] = useState({ content: "", reasoning: "" });
  const [liveTools, setLiveTools] = useState<Record<string, ToolRun>>({});
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(() => new URLSearchParams(location.search).has("dock"));
  const [dockTab, setDockTab] = useState<DockTab>("tools");
  /** Файлы, приложенные к ещё не отправленному сообщению. */
  const [pending, setPending] = useState<Array<{ file: File; id: string }>>([]);
  /** Сессия, у которой открыто подтверждение удаления. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [ctx, setCtx] = useState<{ breakdown: WindowBreakdown | null; limit: number }>({
    breakdown: null,
    limit: CTX_LIMIT,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const rail = useResize("snens-rail-w", 248, 176, 420, 1);
  const dock = useResize("snens-dock-w", 360, 240, 960, -1);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /**
   * Выбор сессии: адрес обновляем через `replaceState`.
   *
   * `pushState` на каждый клик по списку забивал историю браузера — «назад»
   * приходилось щёлкать десятки раз. Одна запись на загрузку страницы: внутри
   * неё сессия переключается без роста истории, а «назад» возвращает туда, где
   * человек был до прихода в приложение.
   */
  const select = useCallback((id: string | null) => {
    setActive(id);
    setRailOpen(false);
    const url = new URL(location.href);
    if (id) url.searchParams.set("session", id);
    else url.searchParams.delete("session");
    if (decodeURIComponent(location.href) !== url.toString()) {
      history.replaceState({ session: id }, "", url);
    }
  }, []);

  // Кнопки браузера: состояние забираем из адреса, а не из своего.
  useEffect(() => {
    const onPop = () => setActive(new URLSearchParams(location.search).get("session"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Первая загрузка без `?session=`: подставляем сессию в адрес через
  // replaceState — это не отдельная запись истории, назад с неё не листают.
  useEffect(() => {
    if (!active) return;
    const url = new URL(location.href);
    if (url.searchParams.get("session") === active) return;
    url.searchParams.set("session", active);
    history.replaceState({ session: active }, "", url);
  }, [active]);

  const loadSessions = useCallback(async () => {
    try {
      const { sessions } = await api.sessions();
      // Порядок приходит с ядра (по mtime лога) — поверхность и форма id на него
      // не влияют. Клиентская сортировка только дублировала бы правила.
      setSessions(sessions);
      return sessions;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return [];
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Без `?session=` показываем приветствие, а не первую сессию: выбор
      // сессии — явное действие человека (или ссылка), не догадка клиента.
      const [, m] = await Promise.all([loadSessions(), api.model().catch(() => null)]);
      if (!alive) return;
      if (m) setModel(m.model);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [loadSessions]);

  useEffect(() => {
    if (!active) return;
    let closed = false;
    let stop: (() => void) | undefined;
    setMsgs([]);
    setLiveTools({});
    setStream({ content: "", reasoning: "" });
    setApproval(null);

    (async () => {
      try {
        const h = await api.history(active);
        if (closed) return;
        setMsgs(h.messages);
        // ?nostream=1 — статичный снимок истории без SSE (скриншоты, отладка)
        const noStream = new URLSearchParams(location.search).has("nostream");
        if (noStream) return;
        stop = subscribe(active, h.cursor, (e: SurfaceEvent) => {
          switch (e.type) {
            case "run.started":
              setRunning(true);
              setRunId(e.run_id ?? null);
              setStream({ content: "", reasoning: "" });
              break;
            case "assistant.delta": {
              const text = String(e.text ?? "");
              const kind = String(e.kind ?? "content");
              setStream((s) =>
                kind === "reasoning"
                  ? { ...s, reasoning: s.reasoning + text }
                  : { ...s, content: s.content + text },
              );
              break;
            }
            case "tool.started": {
              const callId = String(e.call_id ?? "");
              setLiveTools((prev) => ({
                ...prev,
                [callId]: {
                  callId,
                  name: String(e.name ?? "tool"),
                  args: String(e.args ?? ""),
                  state: "running",
                  preview: "",
                  started: Date.now(),
                },
              }));
              break;
            }
            case "tool.completed": {
              const callId = String(e.call_id ?? "");
              setLiveTools((prev) => {
                const old = prev[callId];
                const exit = Number(e.exit ?? 0);
                const done = Date.now();
                return {
                  ...prev,
                  [callId]: {
                    callId,
                    name: old?.name ?? String(e.name ?? "tool"),
                    args: old?.args ?? "",
                    state: exit === 0 ? "ok" : "error",
                    exit,
                    preview: String(e.preview ?? ""),
                    started: old?.started,
                    ms: old?.started ? done - old.started : undefined,
                  },
                };
              });
              break;
            }
            case "approval.requested":
              setApproval({
                id: String(e.approval_id ?? ""),
                command: String(e.command ?? ""),
                cwd: String(e.cwd ?? ""),
              });
              break;
            case "approval.resolved":
              setApproval((a) => (a && a.id === String(e.approval_id ?? "") ? null : a));
              break;
            case "run.finished": {
              setRunning(false);
              setRunId(null);
              setStream({ content: "", reasoning: "" });
              const status = String(e.status ?? "");
              if (status !== "ok" && e.error) setError(`${status}: ${e.error}`);
              // канонический транскрипт — из журнала, а не из стрима
              api.history(active).then((x) => {
                if (!closed) {
                  setMsgs(x.messages);
                  setLiveTools({});
                }
              });
              break;
            }
          }
        });
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    })();

    return () => {
      closed = true;
      stop?.();
    };
  }, [active]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, stream.content, stream.reasoning]);

  // Расклад окна: считает ядро по проекции, обновляем на смену сессии и после
  // каждого хода — в ходе он устаревает.
  useEffect(() => {
    setCtx({ breakdown: null, limit: CTX_LIMIT });
    if (!active) return;
    let alive = true;
    api
      .context(active)
      .then((c) => {
        if (alive) setCtx({ breakdown: c.breakdown, limit: c.limit || CTX_LIMIT });
      })
      .catch(() => {
        /* закрытая/удалённая сессия — оставляем пустой расклад */
      });
    return () => {
      alive = false;
    };
  }, [active, msgs.length, running]);

  // Поиск по журналам: дебаунс 300 мс, чтобы не дёргать ядро на каждую букву.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .search(q, 40)
        .then((r) => setHits(r.hits))
        .catch((e) => setError(String(e instanceof Error ? e.message : e)))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  /** Тулы из журнала: вызов + его результат сводятся в один ToolRun. */
  const tools = useMemo<ToolRun[]>(() => {
    // Без выбранной сессии тулов нет: иначе при «новой сессии» док показывал бы
    // вызовы предыдущей, пока её история ещё лежит в состоянии.
    if (!active) return [];
    const out: ToolRun[] = [];
    const byId = new Map<string, ToolRun>();
    let lastAssistant: ToolRun[] = [];
    for (const m of msgs) {
      if (m.role === "assistant") {
        lastAssistant = [];
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
          lastAssistant.push(t);
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
          const orphan: ToolRun = {
            callId: m.tool_call_id,
            name: m.name ?? "tool",
            args: "",
            state: exit === 0 ? "ok" : "error",
            exit,
            preview: m.content ?? "",
            ms: m.ms,
            parts: m.parts,
            ts: m.ts,
          };
          out.push(orphan);
          lastAssistant.push(orphan);
        }
      }
    }
    for (const t of Object.values(liveTools)) {
      const idx = out.findIndex((x) => x.callId === t.callId);
      if (idx >= 0) out[idx] = t;
      else out.push(t);
    }
    return out;
  }, [active, msgs, liveTools]);

  /** Раскладка ленты: сообщения человека отдельно, промежуточные шаги — пачкой. */
  const blocks = useMemo(() => {
    type Block =
      | { kind: "user"; m: TranscriptMessage }
      | { kind: "answer"; m: TranscriptMessage; tools: ToolRun[] }
      | { kind: "steps"; steps: TranscriptMessage[]; tools: Map<number, ToolRun[]> };
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
    let run: TranscriptMessage[] = [];
    const flush = () => {
      if (run.length === 0) return;
      // Финальный ответ: последний assistant с текстом и без вызовов тулов.
      let answerIdx = -1;
      for (let i = run.length - 1; i >= 0; i--) {
        const m = run[i];
        if (m.role === "assistant" && m.content && !m.tool_calls?.length) {
          answerIdx = i;
          break;
        }
      }
      const answer = answerIdx >= 0 ? run[answerIdx] : undefined;
      const steps = answerIdx >= 0 ? run.slice(0, answerIdx) : run;
      // Рассуждение финального шага хронологически идёт ДО его текста, поэтому
      // оно уезжает в группу промежуточных шагов (в её конец), а не висит под
      // ответом. Если группы нет (ход из одного сообщения) — reasoning остаётся
      // при ответе, но всё равно выводится перед текстом.
      const answerReasoning =
        answer && steps.length > 0 && answer.reasoning
          ? [{ ...answer, content: null } as TranscriptMessage]
          : [];
      const grouped = [...steps, ...answerReasoning];
      if (grouped.length > 0) {
        out.push({
          kind: "steps",
          steps: grouped,
          tools: new Map(steps.map((m) => [m.seq, bySeq.get(m.seq) ?? []])),
        });
      }
      if (answer) {
        out.push({
          kind: "answer",
          m: answerReasoning.length > 0 ? { ...answer, reasoning: undefined } : answer,
          tools: bySeq.get(answer.seq) ?? [],
        });
      }
      run = [];
    };
    for (const m of msgs) {
      if (m.role === "user") {
        // Вставка в ход от подагента (`report`) — часть работы, а не реплика
        // человека: уезжает в текущую пачку шагов. Сообщение самого человека и
        // его же steer (`via: "steer"`) — остаются репликами.
        const fromAgent = m.via === "report" || m.via === "ask";
        if (fromAgent) {
          run.push(m);
          continue;
        }
        flush();
        out.push({ kind: "user", m });
      } else if (m.role === "assistant") {
        // Результаты тулов в ленту отдельными шагами не идут: они уже влиты
        // в свой ToolRun (вызов + результат одним блоком). Иначе текст `fetch`
        // рендерился как markdown и тащил в чат все картинки со страницы.
        run.push(m);
      }
    }
    flush();
    return out;
  }, [msgs, tools]);

  const turns = msgs.filter((m) => m.role !== "tool").length;
  const current = sessions.find((s) => s.id === active);

  // Заголовок вкладки — заголовок сессии: в списке вкладок браузера видно, где
  // что, без переключения.
  useEffect(() => {
    document.title = current?.title ? `${current.title} — snens` : "snens";
  }, [current?.title]);

  async function send() {
    const text = draft.trim();
    if (!text && pending.length === 0) return;
    setError(null);
    try {
      // Сессия создаётся только когда есть что отправить: пустых сессий в
      // списке быть не должно.
      let id = active;
      if (!id) {
        const created = await api.create("web");
        id = created.id;
        select(id);
        setSessions((prev) => [created, ...prev]);
      }
      const ids: string[] = [];
      for (const file of pending) {
        const up = await api.upload(id, file.file);
        ids.push(up.attachment_id);
      }
      await api.send(id, text, ids);
      setDraft("");
      setPending([]);
      setRunning(true);
      const h = await api.history(id);
      setMsgs(h.messages);
      loadSessions();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  /** Новая сессия: экран приветствия, а не пустая запись в журнале. */
  function newSession() {
    select(null);
    setRailOpen(false);
    setDraft("");
    setPending([]);
  }

  async function removeSession(id: string) {
    try {
      await api.remove(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setRemoving(null);
      if (active === id) select(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  function attach(files: FileList | null) {
    if (!files) return;
    setPending((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({ file, id: uuid() })),
    ]);
  }

  async function decide(allow: boolean) {
    if (!approval || !active) return;
    try {
      await api.approve(active, approval.id, allow);
      setApproval(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div
      className="app"
      style={{ "--rail-w": `${rail.size}px`, "--dock-w": `${dock.size}px` } as React.CSSProperties}
    >
      <nav className="rail" data-open={railOpen} aria-label="sessions">
        <div className="rail__brand">
          <span className="rail__mark">snens</span>
          <span className="rail__ver">web</span>
          <button className="rail__close" onClick={() => setRailOpen(false)} aria-label="закрыть">
            ×
          </button>
        </div>

        <div className="rail__search">
          <input
            value={query}
            placeholder="поиск по сообщениям"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                setHits([]);
              }
            }}
          />
          {searching && <span className="rail__searching">…</span>}
        </div>

        <div className="rail__section">
          <span>
            {query.trim()
              ? `найдено ${hits.length}`
              : `sessions ${sessions.filter((s) => !s.parent).length}`}
          </span>
          <button className="ghost" title="new session" onClick={newSession}>
            +
          </button>
        </div>

        {query.trim() ? (
          <ul className="rail__list">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  className="rail__item"
                  aria-current={active === h.id}
                  onClick={() => {
                    select(h.id);
                    setHits([]);
                    setQuery("");
                  }}
                >
                  {h.title || h.matches[0]?.snippet || "—"}
                  <small>
                    {relTime(h.updated_at)} · {h.surface} · {h.matches.length} совпад.
                  </small>
                  {h.matches[0] && (
                    <span className="rail__hit">{h.matches[0].snippet}</span>
                  )}
                </button>
              </li>
            ))}
            {!searching && hits.length === 0 && (
              <li className="rail__empty">ничего не найдено</li>
            )}
          </ul>
        ) : (
          <ul className="rail__list">
            {sessions
              .filter((s) => !s.parent)
              .map((s) => (
              <li key={s.id} className="rail__row" data-removing={removing === s.id}>
                <button
                  className="rail__item"
                  aria-current={active === s.id}
                  onClick={() => select(s.id)}
                >
                  {s.title || "новая сессия"}
                  <small>
                    {relTime(s.updated_at)} · {s.parent ? "подагент" : s.surface}
                    {s.state !== "idle" ? ` · ${s.state}` : ""}
                  </small>
                </button>
                {removing === s.id ? (
                  <span className="rail__confirm">
                    <button
                      className="rail__yes"
                      title="удалить"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSession(s.id);
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
                        setRemoving(null);
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
                      setRemoving(s.id);
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

        <button className="rail__new" onClick={newSession}>
          + new session
        </button>

        <div className="rail__foot">
          <ThemeBar theme={theme} setTheme={setTheme} />
        </div>
      </nav>

      <div className="grip grip--rail" title="тяни · двойной клик — сброс" {...rail.gripProps} />

      <main className="main">
        <header className="topbar" data-idle={!current}>
          <button className="ghost burger" onClick={() => setRailOpen(true)} aria-label="sessions">
            ≡
          </button>
          <span className="topbar__title">{current?.title ?? ""}</span>
          <div className="topbar__meta">
            <button className="ghost dock-toggle" onClick={() => setDockOpen(true)} aria-label="док">
              док
            </button>
            <span className="chip">
              <span className="dot" style={{ background: running ? "var(--accent)" : "var(--ok)" }} />
              {running ? "работает" : "idle"}
            </span>
            {running && active && runId && (
              <button
                className="chip"
                onClick={() => api.stop(active, runId).catch((e) => setError(String(e)))}
              >
                stop
              </button>
            )}
          </div>
        </header>

        <div className="feed" ref={feedRef}>
          {loading && <div className="msg msg--system">загрузка…</div>}
          {/* Нет выбранной сессии — приветствие. Сессия появится в журнале
              только после первого сообщения. */}
          {!loading && !active && (
            <section className="hello">
              <h1 className="hello__mark">snens</h1>
              <p className="hello__lead">
                агент с инструментами: терминал, файлы, поиск, память.
                <br />
                напиши задачу — сессия появится сама.
              </p>
              <dl className="hello__facts">
                <div>
                  <dt>модель</dt>
                  <dd>{model || "—"}</dd>
                </div>
                <div>
                  <dt>сессий</dt>
                  <dd>{sessions.filter((s) => !s.parent).length}</dd>
                </div>
                <div>
                  <dt>подагентов</dt>
                  <dd>{sessions.filter((s) => s.parent).length}</dd>
                </div>
                <div>
                  <dt>окружение</dt>
                  <dd>~/projects</dd>
                </div>
              </dl>
              <p className="hello__hint">
                enter — отправить · shift+enter — перенос · поиск по прошлым сессиям — слева
              </p>
            </section>
          )}
          {!loading && active && msgs.length === 0 && (
            <div className="msg msg--system">
              <div className="msg__main">сессия пуста — напиши первое сообщение.</div>
            </div>
          )}
          {active &&
            blocks.map((b, i) =>
              b.kind === "user" ? (
                <UserTurn key={`u${b.m.seq}`} m={b.m} session={active} />
              ) : b.kind === "answer" ? (
                <article className="msg msg--assistant" key={`a${b.m.seq}`}>
                  <header className="msg__head">
                    <span className="who">snens</span>
                    <time>{time(b.m.ts)}</time>
                  </header>
                  <div className="msg__main">
                    {b.m.reasoning && <Reasoning text={b.m.reasoning} />}
                    <Markdown text={b.m.content ?? ""} />
                    {b.tools.map((t) => (
                      <ToolBlock key={t.callId} t={t} session={active} />
                    ))}
                  </div>
                </article>
              ) : (
                <Steps key={`s${i}`} steps={b.steps} toolsByStep={b.tools} session={active} />
              ),
            )}
          {active && (
            <Live
              content={stream.content}
              reasoning={stream.reasoning}
              tools={Object.values(liveTools)}
              session={active}
            />
          )}
          {approval && (
            <article className="msg msg--approval">
              <header className="msg__head">
                <span className="who">approval</span>
                <span>sudo</span>
              </header>
              <div className="msg__main">
                <pre className="code">{`${approval.command}\ncwd ${approval.cwd}`}</pre>
                <div className="approval__actions">
                  <button className="solid" onClick={() => decide(true)}>
                    разрешить один раз
                  </button>
                  <button onClick={() => decide(false)}>отклонить</button>
                </div>
              </div>
            </article>
          )}
          {error && (
            <article className="msg msg--error">
              <header className="msg__head">
                <span className="who">error</span>
                <button className="ghost" onClick={() => setError(null)}>
                  ×
                </button>
              </header>
              <div className="msg__main">{error}</div>
            </article>
          )}
        </div>

        <div
          className="composer"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.dataset.drag = "true";
          }}
          onDragLeave={(e) => {
            delete e.currentTarget.dataset.drag;
          }}
          onDrop={(e) => {
            e.preventDefault();
            delete e.currentTarget.dataset.drag;
            attach(e.dataTransfer.files);
          }}
        >
          {pending.length > 0 && (
            <ul className="composer__files">
              {pending.map((p) => (
                <li key={p.id}>
                  <span>{p.file.name}</span>
                  <span className="composer__size">{(p.file.size / 1024).toFixed(0)} КБ</span>
                  <button
                    className="ghost"
                    aria-label="убрать"
                    onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="composer__box">
            <button
              className="composer__attach"
              title="прикрепить файл"
              onClick={() => fileInput.current?.click()}
            >
              +
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                attach(e.target.files);
                e.target.value = "";
              }}
            />
            <textarea
              value={draft}
              placeholder="печатай… enter — отправить, shift+enter — перенос, файлы — кнопкой + или drag&drop"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="solid" onClick={send}>
              send
            </button>
          </div>
        </div>

        <div className="statusbar">
          <span className="sb--key" title={model}>
            <span className="sb--model-full">{model || "—"}</span>
            <span className="sb--model-short">
              {model.split("/").pop()?.replace("deepseek-v4.1-", "dsv4-") ?? "—"}
            </span>
          </span>
          <span className="sb--grow">
            {current
              ? `${current.parent ? "подагент" : current.surface} · ${current.state}`
              : "нет сессии"}{" "}
            · {turns} записей
            {current?.model && current.model !== model ? ` · ${current.model}` : ""}
          </span>
          <span className="sb--opt">тулов {tools.length}</span>
          <span className="sb--opt">{running ? "ход идёт" : "простой"}</span>
        </div>
      </main>

      <div className="grip grip--dock" title="тяни · двойной клик — сброс" {...dock.gripProps} />

      <aside className="dock" aria-label="dock">
        {active && <ContextWindow breakdown={ctx.breakdown} limit={ctx.limit} />}
        <Dock
          tab={dockTab}
          setTab={setDockTab}
          tools={tools}
          session={active ?? ""}
        >
          <Agents sessions={sessions} active={active} onPick={select} />
        </Dock>
      </aside>

      <aside className="dock dock--sheet" data-open={dockOpen} aria-label="dock">
        {dockOpen && (
          <>
            {active && <ContextWindow breakdown={ctx.breakdown} limit={ctx.limit} />}
            <Dock
              tab={dockTab}
              setTab={setDockTab}
              tools={tools}
              session={active ?? ""}
              onClose={() => setDockOpen(false)}
            >
              <Agents sessions={sessions} active={active} onPick={select} />
            </Dock>
          </>
        )}
      </aside>
    </div>
  );
}
