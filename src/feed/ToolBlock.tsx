import { useState } from "react";
import type { ToolRun } from "../lenta";
import { argLabel, hasMedia, MARK, MEDIA_TOOLS, mediaPaths, prettyArgs } from "../lib/tool";
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
  const paths = mediaPaths(t);
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

/**
 * Аргументы вызова списком «поле → значение». JSON не показываем: кавычки,
 * скобки и экранирование — это транспорт, а не то, что человек вызвал.
 */
export function ArgsList({ raw }: { raw: string }) {
  const rows = prettyArgs(raw);
  if (rows.length === 0) return null;
  return (
    <dl className="tool__args">
      {rows.map(([k, v]) => (
        <div key={k}>
          {k && <dt>{k}</dt>}
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Тело вызова: у медиа-тулов — пути, у остальных — аргументы и вывод. */
export function ToolOutput({
  t,
  quiet,
  paths,
}: {
  t: ToolRun;
  quiet: boolean;
  paths: string[];
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
      <ArgsList raw={t.args} />
      {t.preview && <pre className="code tool__out">{t.preview}</pre>}
    </>
  );
}
