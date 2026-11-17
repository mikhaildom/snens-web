import { liveSteps, type LiveItem } from "../lenta";
import { Markdown } from "../markdown";
import { ToolBlock } from "./ToolBlock";
import { Reasoning, type ArtifactHooks } from "./turns";
import { UsageInfo } from "./UsageBar";
import { useDecode } from "./useDecode";

/**
 * Живой ход: те же шаги, что и в истории. Последний текст проявляется
 * расшифровкой хвоста, за ним мигает курсор-прямоугольник.
 *
 * Артефакт в стриме живой: тело фенса ещё не закрыто, и `ArtifactView` рисует
 * его по расписанию. Отвечать на его вопросы нельзя — в журнале ещё нет записи,
 * к которой привязать одноразовость (`scope: ""`).
 */
export function Live({ items, hooks }: { items: LiveItem[]; hooks: ArtifactHooks }) {
  const steps = liveSteps(items);
  const lastText = steps.length ? steps[steps.length - 1].text : "";
  const decoded = useDecode(lastText);
  if (steps.length === 0) return null;
  return (
    <article className="msg msg--assistant msg--pending">
      <div className="msg__main">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <div className="step" key={i}>
              {s.reasoning && <Reasoning text={s.reasoning} />}
              {s.text && (
                <div className={last ? "streaming" : undefined}>
                  <Markdown
                    text={last ? decoded : s.text}
                    session={hooks.session}
                    scope=""
                    onAsk={hooks.onAsk}
                    onAnswer={hooks.onAnswer}
                  />
                </div>
              )}
              {s.tools.map((t) => (
                <ToolBlock key={t.callId} t={t} session={hooks.session} defaultOpen={false} />
              ))}
              {s.usage && (
                <div className="m-side">
                  <UsageInfo u={s.usage} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
