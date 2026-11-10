import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, authHeaders, connection } from "../lib/connection.ts";
import type { Artifact } from "../lib/artifact.ts";
import { artifactSize, composeDocument } from "../lib/artifactDoc.ts";
import { afterRender, shouldRender, type RenderState } from "../lib/throttle.ts";
import { useGenuiLibrary } from "../hooks/useGenuiLibrary.ts";
import { useTheme } from "../theme.ts";

/** Вопрос, который артефакт задал человеку через `snens.ask`. */
export interface ArtifactAsk {
  /** Что за вопрос внутри артефакта (`id` в вызове). */
  id: string;
  kind: string;
  question: string;
  options?: unknown;
}

/** Ответ человека: то, что артефакт прислал через `snens.answer`. */
export interface ArtifactAnswer extends ArtifactAsk {
  /** Значение, которое уедет модели: `2`, `["a","c"]`, текст. */
  value: string;
}

/**
 * Артефакт: интерактивный интерфейс модели в ленте.
 *
 * Два режима, один компонент:
 *
 * - **черновик** (`art.open`): модель ещё печатает фенс. Документ
 *   перерисовывается по расписанию с backoff (`lib/throttle.ts`) и **без
 *   скриптов** — половина скрипта в свежем документе падает в консоль и мигает;
 * - **готовый**: перемонтируется со скриптами один раз, дальше живёт.
 *
 * Песочница: `sandbox="allow-scripts allow-forms"` без `allow-same-origin`
 * (origin `null` — нет cookies, localStorage и доступа к `/v1/*`). Разворот —
 * атрибут на обёртке, а не портал: перенос iframe в другого родителя означает
 * новый DOM-узел, то есть перемонтирование и потерю состояния документа.
 */
export function ArtifactView({
  art,
  session,
  onAsk,
  onAnswer,
  scope = "",
  answered,
  data,
}: {
  art: Artifact;
  session: string;
  /** Вопрос объявлен: хост узнаёт о нём, чтобы показать подсказку. */
  onAsk?: (art: Artifact, ask: ArtifactAsk, scope: string) => void;
  /** Человек ответил: это уезжает в чат обычным сообщением. */
  onAnswer?: (art: Artifact, answer: ArtifactAnswer, scope: string) => void;
  /** Область одноразовости — номер записи журнала с артефактом. */
  scope?: string;
  /** Ключи (`scope:artifact:id`) уже отвеченных вопросов. */
  answered?: ReadonlySet<string>;
  /** Preload: данные, которые хост отдаёт артефакту. */
  data?: unknown;
}) {
  const library = useGenuiLibrary();
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  /**
   * Высота: подсказка модели из заголовка фенса, а `fromDoc` — то, что измерил
   * сам документ (`postMessage`). Здесь не эффект, а вычисление: подсказка из
   * `art.head` уже есть при первом рендере, и синхронизировать её состоянием
   * значило бы лишний кадр и рассинхрон при смене ревизии.
   */
  const [fromDoc, setFromDoc] = useState(0);
  // Подсказка модели — нижняя граница: если содержимое выше, растём по нему,
  // а не обрезаем скроллом.
  const height = Math.max(fromDoc, art.head.height || 0) || 220;
  const frame = useRef<HTMLIFrameElement>(null);
  /** Документ черновика: его ставит расписание, не каждый токен стрима. */
  const [draftDoc, setDraftDoc] = useState<string>("");
  const state = useRef<RenderState>({ at: 0, bytes: -1, round: 0 });

  // `src=`-режим: тело берём из файла сессии. Качаем сами, а не через
  // `useFileSrc`: там blob-ссылка для медиа, а здесь нужен текст.
  const [remote, setRemote] = useState<{ key: string; text: string } | null>(null);
  const srcKey = `${session}\u0000${art.head.src}`;
  useEffect(() => {
    if (!art.head.src) return;
    const conn = connection().conn;
    const url = apiUrl(
      `/v1/sessions/${session}/file?path=${encodeURIComponent(art.head.src)}`,
      conn,
    );
    let alive = true;
    fetch(url, { headers: authHeaders(conn) })
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => {
        if (alive && text) setRemote({ key: srcKey, text });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [art.head.src, session, srcKey]);

  const body = art.head.src ? (remote?.key === srcKey ? remote.text : "") : art.body;

  /**
   * Ключи отвеченных вопросов этого артефакта. Вопросы задаются из JS, поэтому
   * узнать их заранее нельзя — их приносит сам документ (`postMessage`). Пока
   * вопрос не пришёл, отвеченных может быть больше, чем мы знаем; поэтому
   * `answered` — внешний источник, а `askedHere` — то, что мы уже видели.
   */
  const prefix = `${scope}:${art.id}:`;
  const isAnswered = useCallback(
    (id: string) => Boolean(answered?.has(`${prefix}${id}`)),
    [answered, prefix],
  );

  /** Вопросы, о которых документ уже сообщил: показываем их под интерфейсом. */
  const [asks, setAsks] = useState<ArtifactAsk[]>([]);

  const build = useCallback(
    (text: string, scripts: boolean) =>
      composeDocument({
        head: art.head,
        body: text,
        library,
        data,
        scripts,
        answered: asks.map((a) => a.id).filter(isAnswered),
      }),
    [art.head, library, data, asks, isAnswered],
  );

  /**
   * Готовый документ считается прямо в рендере: это чистая функция тела.
   * Черновик — другое дело: там нужен таймер, поэтому эффект (единственная
   * внешняя система здесь — время).
   */
  const built = useMemo(() => (body ? build(body, !art.open) : ""), [body, art.open, build]);
  useEffect(() => {
    if (!art.open) return;
    const now = Date.now();
    if (!shouldRender(now, state.current, body.length)) return;
    setDraftDoc(built);
    state.current = afterRender(now, body.length, state.current.round);
  }, [art.open, body, built]);

  /** Что лежит в iframe: готовый документ или последний отрисованный черновик. */
  const doc = art.open ? draftDoc : built;

  // Тема snens → документ: `prefers-color-scheme` внутри iframe свой, а у нас
  // тема может быть выбрана руками. Ставим атрибут в готовый документ.
  useEffect(() => {
    const el = frame.current;
    const inner = el?.contentDocument;
    if (!inner?.documentElement) return;
    inner.documentElement.dataset.theme = theme;
  }, [theme, doc]);

  /** Сообщения документа: высота, ошибки, вопросы человеку. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Строго: только свой iframe и только origin `null` (так выглядит песочница).
      if (!frame.current || e.source !== frame.current.contentWindow || e.origin !== "null") return;
      const d = e.data as {
        snens?: number;
        type?: string;
        h?: number;
        id?: string;
        kind?: string;
        question?: string;
        options?: unknown;
        value?: unknown;
      };
      if (!d || d.snens !== 1) return;
      if (d.type === "height" && typeof d.h === "number" && d.h > 0) {
        // Не даём одной ошибке разметки растянуть ленту на километр. Ноль
        // измерения не принимаем: пустой документ сообщает 0, и это не повод
        // схлопнуть блок в 80 пикселей.
        setFromDoc(Math.max(80, Math.min(Math.round(d.h), Math.round(window.innerHeight * 0.9))));
      }
      if (d.type === "ask") {
        const ask: ArtifactAsk = {
          id: String(d.id ?? "q"),
          kind: String(d.kind ?? "text"),
          question: String(d.question ?? ""),
          options: d.options,
        };
        // Повтор того же вопроса из документа не должен копить подписи.
        setAsks((prev) => (prev.some((a) => a.id === ask.id) ? prev : [...prev, ask]));
        onAsk?.(art, ask, scope);
        return;
      }
      if (d.type === "answer") {
        const id = String(d.id ?? "q");
        const known = asks.find((a) => a.id === id);
        // `value` — что именно выбрал человек. Объект/массив сериализуем в
        // JSON: модели всё равно нужен текст, а разбирать его обратно незачем.
        const raw = d.value ?? "";
        const value = typeof raw === "string" ? raw : JSON.stringify(raw);
        onAnswer?.(
          art,
          {
            id,
            kind: known?.kind ?? String(d.kind ?? "text"),
            question: known?.question ?? String(d.question ?? ""),
            value,
          },
          scope,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [art, onAsk, onAnswer, scope, asks]);

  // Escape закрывает разворот: внутри iframe клавишу не поймать, слушаем окно.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevBody;
    };
  }, [expanded]);

  const label = useMemo(() => artifactSize(body), [body]);
  const draft = art.open;
  const nets = art.head.net;

  return (
    <figure className="artifact" data-expanded={expanded || undefined} data-draft={draft || undefined}>
      <figcaption className="artifact__head">
        <span className="artifact__mark">{draft ? "◌" : "▣"}</span>
        <span className="artifact__name">{art.id}</span>
        <span className="artifact__meta">
          {draft ? "Рисует" : art.rev > 1 ? `Правка ${art.rev}` : "Артефакт"}, {label}
        </span>
        <span className="artifact__right">
          {nets.length > 0 && (
            <span className="artifact__net" title="Домены, к которым разрешена сеть">
              Сеть: {nets.join(", ")}
            </span>
          )}
          <button
            className="ghost artifact__size"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Свернуть" : "Развернуть"}
            aria-label={expanded ? "Свернуть" : "Развернуть"}
          >
            {expanded ? "⤡" : "⤢"}
          </button>
        </span>
      </figcaption>
      <div className="artifact__body" style={{ height }}>
        {doc ? (
          <iframe
            ref={frame}
            className="artifact__frame"
            title={`Артефакт ${art.id}`}
            sandbox={draft ? "allow-forms" : "allow-scripts allow-forms"}
            srcDoc={doc}
          />
        ) : (
          <div className="artifact__empty">Пусто: модель ещё не написала тело</div>
        )}
      </div>
      {asks.length > 0 && (
        <div className="artifact__asks">
          {asks.map((a) => (
            <span key={a.id} className="artifact__ask" data-answered={isAnswered(a.id) || undefined}>
              {isAnswered(a.id) ? "Отвечено" : "Ждёт ответа"}: {a.question || a.id}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
