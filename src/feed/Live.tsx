import { Markdown } from "../markdown";
import type { LiveItem } from "../lenta";
import { MsgHead } from "./Head";
import { ToolBlock } from "./ToolBlock";
import { Reasoning } from "./turns";

/** Живая лента хода: то, что приехало по SSE и ещё не стало историей. */
export function Live({ items, session }: { items: LiveItem[]; session: string }) {
  if (items.length === 0) return null;
  return (
    <article className="msg msg--assistant msg--pending">
      <MsgHead who="snens" meta={<span>стрим</span>} />
      <div className="msg__main">
        {items.map((it) =>
          it.kind === "tool" ? (
            <ToolBlock key={`t${it.seq}`} t={it.tool} session={session} defaultOpen={false} />
          ) : it.kind === "reasoning" ? (
            <Reasoning key={`r${it.seq}`} text={it.text} />
          ) : (
            <Markdown key={`x${it.seq}`} text={it.text} />
          ),
        )}
      </div>
    </article>
  );
}
