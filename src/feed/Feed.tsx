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
            <span className="who">нужен пароль</span>
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
            <span className="who">ошибка</span>
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

/**
 * Приветствие без сессии: марка и модель. Больше ничего — остальное человек
 * узнаёт из самой работы, а подсказки про клавиши живут в поле ввода.
 */
export function Hello({ model }: { model: string }) {
  return (
    <section className="hello">
      <h1 className="hello__mark">snens</h1>
      <dl className="hello__facts">
        <div>
          <dt>модель</dt>
          <dd>{model || "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Пустая выбранная сессия. */
export function EmptySession() {
  return (
    <div className="msg msg--system">
      <div className="msg__main">тут пока пусто — напиши задачу</div>
    </div>
  );
}
