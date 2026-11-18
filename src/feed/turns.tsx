import type { ReactNode } from "react";
import { time } from "../lib/time";
import type { TranscriptMessage } from "../api";
import type { Artifact } from "../lib/artifact.ts";
import { Markdown } from "../markdown";
import type { ToolRun } from "../lenta";
import type { ArtifactAnswer, ArtifactAsk } from "./Artifact";
import { MsgHead, MsgFoot } from "./Head";
import { ToolBlock } from "./ToolBlock";
import { UsageInfo } from "./UsageBar";
import { Attachments } from "./Attachments";

/** Вопрос объявлен артефактом — хост показывает подсказку под интерфейсом. */
export type AskHandler = (art: Artifact, ask: ArtifactAsk, scope: string) => void;
/** Человек ответил в артефакте: это уезжает в чат обычным сообщением. */
export type AnswerHandler = (art: Artifact, answer: ArtifactAnswer, scope: string) => void;

/**
 * Общая прокида артефактов вглубь ленты: `session` нужен для `src=`-файлов,
 * `scope` — это `seq` записи журнала, в которой лежит артефакт. Без `scope`
 * (`seq` неизвестен или отрицательный — живой стрим) артефакт можно смотреть,
 * но не отвечать: ядру не к чему привязать одноразовость.
 */
export interface ArtifactHooks {
  session: string;
  scope: string;
  onAsk?: AskHandler;
  onAnswer?: AnswerHandler;
  /** Ключи (`scope:artifact:id`) уже отвеченных вопросов. */
  answered?: ReadonlySet<string>;
}

/** Reasoning свёрнут по умолчанию: в спокойном чтении он не нужен. */
export function Reasoning({ text, side }: { text: string; side?: ReactNode }) {
  return (
    <details className="reasoning">
      <summary>
        Размышления
        {side}
      </summary>
      <div>{text}</div>
    </details>
  );
}

/** Один шаг модели: текст ответа, reasoning (свёрнут) и его вызовы тулов. */
export function Step({ m, tools, hooks }: { m: TranscriptMessage; tools: ToolRun[]; hooks: ArtifactHooks }) {
  const hasBody = Boolean(m.content) || tools.length > 0 || Boolean(m.reasoning);
  if (!hasBody) return null;
  // Вставка в ход: вернувшаяся работа (итог фонового задания, отчёт подагента)
  // или вопрос подагента. Автор — по имени сессии, без служебных префиксов в
  // тексте. Артефактов тут не бывает: это чужое слово.
  if (m.via === "report" || m.via === "ask" || m.via === "wake") {
    const who = m.via === "ask" ? "Вопрос подагента" : m.via === "wake" ? "Вернувшаяся работа" : "Отчёт подагента";
    return (
      <div className="step step--via">
        <MsgHead who={who} meta={<span>{m.from ? m.from.slice(0, 8) : ""}</span>} ts={m.ts} />
        <div className="via__body">{m.content && <Markdown text={m.content} images={false} />}</div>
      </div>
    );
  }
  // Цена и время шага — сбоку от его первой строки: у «Размышлений», а если их
  // нет, отдельной строкой справа. Клик по значку не раскрывает размышления.
  const side =
    m.usage || m.ts ? (
      <span className="m-side m-side--row" onClick={(e) => e.preventDefault()}>
        {m.usage && <UsageInfo u={m.usage} />}
        {m.ts != null && <time>{time(m.ts)}</time>}
      </span>
    ) : null;
  return (
    <div className="step">
      {/* Хронология хода: сначала модель думает, потом пишет. */}
      {m.reasoning ? <Reasoning text={m.reasoning} side={side} /> : side && <div className="step-meta">{side}</div>}
      {m.content && (
        <Markdown
          text={m.content}
          session={hooks.session}
          scope={hooks.scope}
          answered={hooks.answered}
          onAsk={hooks.onAsk}
          onAnswer={hooks.onAnswer}
        />
      )}
      {tools.map((t) => (
        <ToolBlock key={t.callId} t={t} session={hooks.session} />
      ))}
    </div>
  );
}

/** Реплика человека: текст и вложения, которые он приложил. */
export function UserTurn({ m, hooks }: { m: TranscriptMessage; hooks: ArtifactHooks }) {
  // Провизорная реплика: ядро её приняло в очередь, но в журнал она уедет
  // только на границе хода. Пометка объясняет, почему агент ещё не ответил.
  const queued = m.seq < 0;
  return (
    <article className="msg msg--user" data-queued={queued || undefined}>
      {queued ? (
        <div className="msg__note">передано агенту, ход ещё идёт</div>
      ) : m.source && m.source !== "surface" && m.source !== "web" ? (
        <div className="msg__note">{m.source}</div>
      ) : null}
      <div className="msg__main">
        {m.content && (
          <Markdown
            text={m.content}
            session={hooks.session}
            scope={hooks.scope}
            answered={hooks.answered}
            onAsk={hooks.onAsk}
            onAnswer={hooks.onAnswer}
          />
        )}
        <Attachments session={hooks.session} parts={m.parts} />
      </div>
    </article>
  );
}

/** Текст модели, показанный на виду: промежуточный completion. */
export function Say({
  m,
  hooks,
  onFork,
}: {
  m: TranscriptMessage;
  hooks: ArtifactHooks;
  onFork?: (seq: number) => Promise<void> | void;
}) {
  return (
    <article className="msg msg--assistant">
      <MsgFoot
        text={m.content}
        right={m.usage ? <UsageInfo u={m.usage} /> : undefined}
        ts={m.ts}
        onFork={onFork && m.seq > 0 ? () => onFork(m.seq) : undefined}
      />
      <div className="msg__main">
        <Markdown
          text={m.content ?? ""}
          session={hooks.session}
          scope={hooks.scope}
          answered={hooks.answered}
          onAsk={hooks.onAsk}
          onAnswer={hooks.onAnswer}
        />
      </div>
    </article>
  );
}
