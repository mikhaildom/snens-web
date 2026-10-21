import type { ReactNode } from "react";
import { time } from "../lib/time";

/** Шапка сообщения: кто, служебные пометки, расход, время справа. */
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
