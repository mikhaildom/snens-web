import { memo } from "react";
import type { Block, LiveItem } from "../lenta";
import type { Approval } from "../hooks/useTranscript";
import { AnswerMark } from "./AnswerMark";
import { Fold } from "./Fold";
import { Live } from "./Live";
import { Recall } from "./Recall";
import { ReviewMark } from "./ReviewMark";
import { Say, UserTurn, type ArtifactHooks } from "./turns";
import { DitherLogo } from "./DitherLogo";
import { Icon } from "../ui/icons";

/**
 * Тело ленты: блоки истории, живой стрим, ожидание одобрения и ошибка.
 *
 * `memo` здесь не микрооптимизация: лента — самая тяжёлая часть дерева (у
 * длинной сессии тысячи блоков), и без мемоизации она перерисовывалась на
 * каждое изменение состояния `App` — включая ввод в композере.
 *
 * `scope` у каждого блока — это `seq` записи журнала: по нему ответ человека на
 * вопрос артефакта привязывается к тому самому артефакту (одноразовость).
 */
export const Feed = memo(function Feed({
  session,
  blocks,
  live,
  error,
  onDismissError,
  onAsk,
  onAnswer,
  answered,
  onFork,
}: {
  session: string;
  blocks: Block[];
  live: LiveItem[];
  /** Подтверждение теперь над полем ввода (`ApprovalBar`); здесь не рисуется. */
  approval?: Approval | null;
  onDecide?: (allow: boolean) => void;
  error: string | null;
  onDismissError: () => void;
  onAsk?: ArtifactHooks["onAsk"];
  onAnswer?: ArtifactHooks["onAnswer"];
  /** Ключи `seq:artifact:id` уже отвеченных вопросов: повторно не спрашиваем. */
  answered?: ReadonlySet<string>;
  /** Ответвить сессию от ответа с этим `seq`. */
  onFork?: (seq: number) => Promise<void> | void;
}) {
  const hooks = (seq: number): ArtifactHooks => ({
    session,
    scope: seq > 0 ? String(seq) : "",
    onAsk,
    onAnswer,
    answered,
  });
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === "user" ? (
          <UserTurn key={`u${i}`} m={b.m} hooks={hooks(b.m.seq)} />
        ) : b.kind === "answer" ? (
          <AnswerMark key={`a${i}`} m={b.m} />
        ) : b.kind === "say" ? (
          <Say key={`s${i}`} m={b.m} hooks={hooks(b.m.seq)} onFork={onFork} />
        ) : b.kind === "recall" ? (
          <Recall key={`r${i}`} m={b.m} />
        ) : b.kind === "review" ? (
          <ReviewMark key={`v${i}`} m={b.m} />
        ) : (
          <Fold key={`f${i}`} parts={b.parts} hooks={hooks(0)} />
        ),
      )}
      <Live items={live} hooks={{ session, scope: "", onAsk, onAnswer, answered }} />
      {error && (
        <div className="msg-err" role="alert">
          <span>{error}</span>
          <button className="ibtn" onClick={() => onDismissError()} aria-label="скрыть ошибку">
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
});

/** Подтверждение sudo: стоит над полем ввода, рамкой акцента. */
export function ApprovalBar({ approval, onDecide }: { approval: Approval; onDecide: (allow: boolean) => void }) {
  return (
    <div className="appr" role="group" aria-label="Подтверждение действия">
      <div className="appr-t">
        Нужны права администратора
        <code>{approval.command}</code>
        <small>{approval.cwd}</small>
      </div>
      <button className="gbtn" onClick={() => onDecide(false)}>
        Отклонить
      </button>
      <button className="pbtn" onClick={() => onDecide(true)}>
        Разрешить один раз
      </button>
    </div>
  );
}

/**
 * Приветствие без сессии: одна карточка на живом дизере — логотип, модель и
 * подсказка для первого раза. Клик по модели открывает её настройки.
 */
export function Hello({ model, onModel }: { model: string; onModel: () => void }) {
  return (
    <section className="hello">
      <div className="hello-in">
        <div className="hello-logo">
          <DitherLogo />
        </div>
        <button className="modelbox" onClick={onModel} title="Сменить модель">
          <small>Модель</small>
          <b>{model || "не выбрана"}</b>
          <Icon name="chevron" />
        </button>
        <p className="hint">
          Не знаешь, умеет ли snens то, что тебе нужно?
          <b>Спроси его об этом</b>
        </p>
      </div>
    </section>
  );
}

/** Пустая выбранная сессия. */
export function EmptySession() {
  return (
    <div className="msg msg--system">
      <div className="msg__main">Тут пока пусто, напиши задачу</div>
    </div>
  );
}
