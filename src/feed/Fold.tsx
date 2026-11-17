import { useState } from "react";
import type { FoldPart, ToolRun } from "../lenta";
import { stepsWord } from "../lib/format";
import { dur } from "../lib/time";
import { ToolBlock } from "./ToolBlock";
import { Step, type ArtifactHooks } from "./turns";
import { Icon } from "../ui/icons";
import type { Usage } from "../api";
import { UsageInfo } from "./UsageBar";
import { time } from "../lib/time";

/**
 * Свёрнутая пачка: выполнение инструментов и шаги без completion-текста
 * (рассуждение, отчёты подагентов). Текст модели сюда не попадает — он виден.
 */
export function Fold({ parts, hooks }: { parts: FoldPart[]; hooks: ArtifactHooks }) {
  const [open, setOpen] = useState(false);
  const tools: ToolRun[] = parts.flatMap((p) => (p.kind === "tool" ? [p.t] : p.tools));
  const msgs = parts.filter((p) => p.kind === "msg").length;
  const ms = tools.reduce((n, t) => n + (t.ms ?? 0), 0);
  const reports = parts.filter(
    (p) => p.kind === "msg" && (p.m.via === "report" || p.m.via === "ask"),
  ).length;
  // Подпись пачки: что именно от тебя спрятано. «1 шаг» про рассуждение
  // человеку ничего не говорит, поэтому такие пачки называем по содержимому.
  const label =
    tools.length > 0
      ? `${tools.length} ${stepsWord(tools.length)}`
      : msgs > 0 && reports === msgs
        ? `Отчёты: ${reports}`
        : "Размышления";
  // Расход всей пачки: сумма по шагам модели внутри неё.
  const usage = parts.reduce<Usage | null>((acc, p) => {
    const u = p.kind === "msg" ? p.m.usage : undefined;
    if (!u) return acc;
    if (!acc) return { ...u };
    return {
      in_tok: acc.in_tok + u.in_tok,
      cached_tok: acc.cached_tok + u.cached_tok,
      out_tok: acc.out_tok + u.out_tok,
      reason_tok: acc.reason_tok + u.reason_tok,
      cost_micro: acc.cost_micro + u.cost_micro,
    };
  }, null);
  const last = [...parts].reverse().find((p) => p.kind === "msg");
  const ts = last && last.kind === "msg" ? last.m.ts : undefined;
  return (
    <section className="steps" data-open={open}>
      <div className="steps__row">
        <button className="steps__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="steps__caret">
            <Icon name="chevron" size={12} />
          </span>
          <span>{label}</span>
          {ms > 0 && <span className="steps__dim">{dur(ms)}</span>}
        </button>
        {!open && (usage || ts) && (
          <span className="m-side">
            {usage && <UsageInfo u={usage} />}
            {ts != null && <time>{time(ts)}</time>}
          </span>
        )}
      </div>
      {open && (
        <div className="steps__body">
          {parts.map((p, i) =>
            p.kind === "tool" ? (
              <ToolBlock key={`t${i}`} t={p.t} session={hooks.session} />
            ) : (
              <Step key={`m${i}`} m={p.m} tools={p.tools} hooks={hooks} />
            ),
          )}
        </div>
      )}
    </section>
  );
}
