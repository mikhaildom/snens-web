import { liveSteps, type LiveItem } from "../lenta";
import { Markdown } from "../markdown";
import { MsgHead } from "./Head";
import { ToolBlock } from "./ToolBlock";
import { Reasoning } from "./turns";
import { UsageBar } from "./UsageBar";

/**
 * Живой ход: те же шаги, что и в истории. Заголовок «snens · печатает…» стоит один
 * раз на весь ход, а внутри — шаги с рассуждением, текстом и тулами, как их
 * потом покажет журнал. Раньше стрим был плоским списком блоков: другая
 * группировка, reasoning не свёрнут, тулы отдельными карточками — переход
 * «стрим → история» перерисовывал ленту целиком.
 */
export function Live({ items, session }: { items: LiveItem[]; session: string }) {
  const steps = liveSteps(items);
  if (steps.length === 0) return null;
  return (
    <article className="msg msg--assistant msg--pending">
      <MsgHead who="snens" meta={<span>печатает…</span>} />
      <div className="msg__main">
        {steps.map((s, i) => (
          <div className="step" key={i}>
            {s.usage && <UsageBar u={s.usage} />}
            {s.reasoning && <Reasoning text={s.reasoning} />}
            {s.text && <Markdown text={s.text} />}
            {s.tools.map((t) => (
              <ToolBlock key={t.callId} t={t} session={session} defaultOpen={false} />
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}
