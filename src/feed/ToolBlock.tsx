import { useState } from "react";
import type { ToolRun } from "../lenta";
import { argLabel, hasMedia, MARK, MEDIA_TOOLS, viewedPaths } from "../lib/tool";
import { dur, time } from "../lib/time";
import { Attachments } from "./Attachments";

/**
 * Вызов инструмента и его результат — один блок: имя, аргументы, exit, время,
 * раскрывается в argv + вывод + вложения.
 */
export function ToolBlock({
  t,
  session,
  defaultOpen,
}: {
  t: ToolRun;
  session: string;
  defaultOpen?: boolean;
}) {
  // Тул с медиа раскрыт сразу: смысл вложения — увидеть, что смотрел агент,
  // а не разворачивать блок руками.
  const media = hasMedia(t);
  const paths = viewedPaths(t);
  // У медиа-тулов argv и служебный вывод не показываем: они дублируют то, что
  // и так видно — картинки и их пути.
  const quiet = MEDIA_TOOLS.has(t.name) && (paths.length > 0 || media);
  const [open, setOpen] = useState(!!defaultOpen || media || quiet);
  return (
    <div className="tool" data-state={t.state}>
      <button className="tool__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="tool__mark">{MARK[t.state]}</span>
        <span className="tool__name">{t.name}</span>
        <span className="tool__arg">{argLabel(t)}</span>
        <span className="tool__meta">
          {t.exit != null && t.exit !== 0 ? `exit ${t.exit}` : ""}
          {t.ms != null && <span className="tool__ms">{dur(t.ms)}</span>}
          {t.ts != null && <time>{time(t.ts)}</time>}
        </span>
      </button>
      {open && (
        <div className="tool__body">
          <ToolOutput t={t} quiet={quiet} paths={paths} />
          <Attachments session={session} parts={t.parts} />
        </div>
      )}
    </div>
  );
}

/** Тело вызова: у медиа-тулов — пути, у остальных — argv и вывод. */
export function ToolOutput({
  t,
  quiet,
  paths,
  raw,
}: {
  t: ToolRun;
  quiet: boolean;
  paths: string[];
  /** Док рисует argv/вывод голыми `<pre>` — без класса `.code`. */
  raw?: boolean;
}) {
  if (quiet) {
    if (paths.length === 0) return null;
    return (
      <ul className="tool__paths">
        {paths.map((p) => (
          <li key={p} title={p}>
            {p}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      {t.args && <pre className={raw ? undefined : "code"}>{t.args}</pre>}
      {t.preview && <pre className={raw ? undefined : "code tool__out"}>{t.preview}</pre>}
    </>
  );
}
