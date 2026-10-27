import { liveSteps, type LiveItem } from "../lenta";
import { Markdown } from "../markdown";
import { MsgHead } from "./Head";
import { ToolBlock } from "./ToolBlock";
import { Reasoning, type ArtifactHooks } from "./turns";
import { UsageBar } from "./UsageBar";

/**
 * Живой ход: те же шаги, что и в истории. Заголовок «snens · печатает…» стоит один
 * раз на весь ход, а внутри — шаги с рассуждением, текстом и тулами, как их
 * потом покажет журнал. Раньше стрим был плоским списком блоков: другая
 * группировка, reasoning не свёрнут, тулы отдельными карточками — переход
 * «стрим → история» перерисовывал ленту целиком.
 *
 * Артефакт в стриме живой: тело фенса ещё не закрыто, и `ArtifactView` рисует
 * его по расписанию. Отвечать на его вопросы нельзя — в журнале ещё нет записи,
 * к которой привязать одноразовость (`scope: ""`).
 */
export function Live({ items, hooks }: { items: LiveItem[]; hooks: ArtifactHooks }) {
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
            {s.text && (
              <Markdown
                text={s.text}
                session={hooks.session}
                scope=""
                onAsk={hooks.onAsk}
                onAnswer={hooks.onAnswer}
              />
            )}
            {s.tools.map((t) => (
              <ToolBlock key={t.callId} t={t} session={hooks.session} defaultOpen={false} />
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}
