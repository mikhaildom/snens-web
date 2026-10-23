import { useState } from "react";
import type { FoldPart, ToolRun } from "../lenta";
import { stepsWord } from "../lib/format";
import { dur } from "../lib/time";
import { ToolBlock } from "./ToolBlock";
import { Step } from "./turns";

/**
 * Свёрнутая пачка: выполнение инструментов и шаги без completion-текста
 * (рассуждение, отчёты подагентов). Текст модели сюда не попадает — он виден.
 */
export function Fold({ parts, session }: { parts: FoldPart[]; session: string }) {
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
        ? `${reports} отчёт`
        : "рассуждение";
  return (
    <section className="steps" data-open={open}>
      <button className="steps__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="steps__caret">{open ? "▾" : "▸"}</span>
        <span>{label}</span>
        {ms > 0 && <span className="steps__dim">{dur(ms)}</span>}
      </button>
      {open && (
        <div className="steps__body">
          {parts.map((p, i) =>
            p.kind === "tool" ? (
              <ToolBlock key={`t${i}`} t={p.t} session={session} />
            ) : (
              <Step key={`m${i}`} m={p.m} tools={p.tools} session={session} />
            ),
          )}
        </div>
      )}
    </section>
  );
}
