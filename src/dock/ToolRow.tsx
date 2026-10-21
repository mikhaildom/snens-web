import { useState } from "react";
import type { ToolRun } from "../lenta";
import { argLabel, hasMedia, MARK, MEDIA_TOOLS, viewedPaths } from "../lib/tool";
import { dur } from "../lib/time";
import { Attachments } from "../feed/Attachments";
import { ToolOutput } from "../feed/ToolBlock";

/** Вызов тула строкой дока: заголовок-тоггл и раскрытое тело. */
export function ToolRow({ t, session }: { t: ToolRun; session: string }) {
  const [open, setOpen] = useState(hasMedia(t));
  const paths = viewedPaths(t);
  const quiet = MEDIA_TOOLS.has(t.name) && paths.length > 0;
  return (
    <section className="win">
      <button className="win__bar" onClick={() => setOpen((v) => !v)}>
        <span className="win__kind">{MARK[t.state]}</span>
        <span>{t.name}</span>
        <span className="win__arg">{argLabel(t)}</span>
        <span className="win__state" data-state={t.state}>
          {t.ms != null ? dur(t.ms) : t.state}
        </span>
      </button>
      {open && (
        <div className="win__body">
          <ToolOutput t={t} quiet={quiet} paths={paths} raw />
          <Attachments session={session} parts={t.parts} />
        </div>
      )}
    </section>
  );
}
