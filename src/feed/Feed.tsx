import { memo } from "react";
import type { Block, LiveItem } from "../lenta";
import type { Approval } from "../hooks/useTranscript";
import { Fold } from "./Fold";
import { Live } from "./Live";
import { Recall } from "./Recall";
import { ReviewMark } from "./ReviewMark";
import { Say, UserTurn } from "./turns";

/**
 * Тело ленты: блоки истории, живой стрим, ожидание одобрения и ошибка.
 *
 * `memo` здесь не микрооптимизация: лента — самая тяжёлая часть дерева (у
 * длинной сессии тысячи блоков), и без мемоизации она перерисовывалась на
 * каждое изменение состояния `App` — включая ввод в композере.
 */
export const Feed = memo(function Feed({
  session,
  blocks,
  live,
  approval,
  onDecide,
  error,
  onDismissError,
}: {
  session: string;
  blocks: Block[];
  live: LiveItem[];
  approval: Approval | null;
  onDecide: (allow: boolean) => void;
  error: string | null;
  onDismissError: () => void;
}) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === "user" ? (
          <UserTurn key={`u${i}`} m={b.m} session={session} />
        ) : b.kind === "say" ? (
          <Say key={`s${i}`} m={b.m} />
        ) : b.kind === "recall" ? (
          <Recall key={`r${i}`} m={b.m} />
        ) : b.kind === "review" ? (
          <ReviewMark key={`v${i}`} m={b.m} />
        ) : (
          <Fold key={`f${i}`} parts={b.parts} session={session} />
        ),
      )}
      <Live items={live} session={session} />
      {approval && (
        <article className="msg msg--approval">
          <header className="msg__head">
            <span className="who">approval</span>
            <span>sudo</span>
          </header>
          <div className="msg__main">
            <pre className="code">{`${approval.command}\ncwd ${approval.cwd}`}</pre>
            <div className="approval__actions">
              <button className="solid" onClick={() => onDecide(true)}>
                разрешить один раз
              </button>
              <button onClick={() => onDecide(false)}>отклонить</button>
            </div>
          </div>
        </article>
      )}
      {error && (
        <article className="msg msg--error">
          <header className="msg__head">
            <span className="who">error</span>
            <button className="ghost" onClick={onDismissError}>
              ×
            </button>
          </header>
          <div className="msg__main">{error}</div>
        </article>
      )}
    </>
  );
});

/** Приветствие без сессии: сессия появится только после первого сообщения. */
export function Hello({
  model,
  sessions,
  agents,
}: {
  model: string;
  sessions: number;
  agents: number;
}) {
  return (
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
          <dd>{sessions}</dd>
        </div>
        <div>
          <dt>подагентов</dt>
          <dd>{agents}</dd>
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
  );
}

/** Пустая выбранная сессия. */
export function EmptySession() {
  return (
    <div className="msg msg--system">
      <div className="msg__main">сессия пуста — напиши первое сообщение.</div>
    </div>
  );
}
