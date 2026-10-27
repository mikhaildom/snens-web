import type { TranscriptMessage } from "../api";
import type { Artifact } from "../lib/artifact.ts";
import { Markdown } from "../markdown";
import type { ToolRun } from "../lenta";
import type { ArtifactAnswer, ArtifactAsk } from "./Artifact";
import { MsgHead } from "./Head";
import { ToolBlock } from "./ToolBlock";
import { UsageBar } from "./UsageBar";
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
export function Reasoning({ text }: { text: string }) {
  return (
    <details className="reasoning">
      <summary>рассуждение</summary>
      <div>{text}</div>
    </details>
  );
}

/** Один шаг модели: текст ответа, reasoning (свёрнут) и его вызовы тулов. */
export function Step({ m, tools, hooks }: { m: TranscriptMessage; tools: ToolRun[]; hooks: ArtifactHooks }) {
  const hasBody = Boolean(m.content) || tools.length > 0 || Boolean(m.reasoning);
  if (!hasBody) return null;
  // Вставка в ход: вопрос или отчёт подагента. Автор — по имени сессии, без
  // служебных префиксов в тексте. Артефактов тут не бывает: это чужое слово.
  if (m.via === "report" || m.via === "ask") {
    return (
      <div className="step step--via">
        <MsgHead
          who={m.via === "ask" ? "вопрос" : "отчёт"}
          meta={<span>{m.from ? m.from.slice(0, 8) : "подагент"}</span>}
          ts={m.ts}
        />
        <div className="via__body">{m.content && <Markdown text={m.content} images={false} />}</div>
      </div>
    );
  }
  return (
    <div className="step">
      <MsgHead who="snens" right={m.usage ? <UsageBar u={m.usage} /> : undefined} ts={m.ts} />
      {/* Хронология хода: сначала модель думает, потом пишет. */}
      {m.reasoning && <Reasoning text={m.reasoning} />}
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
      <MsgHead
        who="you"
        meta={
          queued ? (
            <span>передан агенту · ход ещё идёт</span>
          ) : m.source && m.source !== "surface" ? (
            <span>{m.source}</span>
          ) : undefined
        }
        ts={m.ts}
      />
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
export function Say({ m, hooks }: { m: TranscriptMessage; hooks: ArtifactHooks }) {
  return (
    <article className="msg msg--assistant">
      <MsgHead who="snens" right={m.usage ? <UsageBar u={m.usage} /> : undefined} ts={m.ts} />
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
