import { useState, type ReactNode } from "react";
import { time } from "../lib/time";
import { Icon } from "../ui/icons";

/** Шапка служебной записи (отчёт, вопрос подагента): кто и время. */
export function MsgHead({
  who,
  meta,
  right,
  ts,
}: {
  who: string;
  meta?: ReactNode;
  right?: ReactNode;
  ts?: number;
}) {
  return (
    <header className="msg__head">
      <span className="who">{who}</span>
      {meta}
      {right}
      {ts != null && <time>{time(ts)}</time>}
    </header>
  );
}

/**
 * Плашка ответа справа под текстом: копировать, ветвь, токены и цена, время.
 * Появляется при наведении на ответ, чтобы в спокойном чтении цифр не было.
 */
export function MsgFoot({
  text,
  right,
  ts,
  onFork,
}: {
  text?: string | null;
  right?: ReactNode;
  ts?: number;
  onFork?: () => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  const [forking, setForking] = useState(false);
  return (
    <div className="m-side">
      {text ? (
        <button
          className="m-side__btn"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <Icon name="copy" size={12} />
          {copied ? "Скопировано" : "Копировать"}
        </button>
      ) : null}
      {onFork && (
        <button
          className="m-side__btn"
          disabled={forking}
          title="Новая сессия с этой историей до этого ответа"
          onClick={async () => {
            setForking(true);
            try {
              await onFork();
            } finally {
              setForking(false);
            }
          }}
        >
          <Icon name="branch" size={12} />
          Ветвь
        </button>
      )}
      {right}
      {ts != null && <time>{time(ts)}</time>}
    </div>
  );
}
