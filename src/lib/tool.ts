/** Всё, что клиент знает про вызов тула, не заглядывая в его результат. */

import type { ToolRun } from "../lenta";
import { shortArgs } from "./format.ts";

export const MARK: Record<ToolRun["state"], string> = { ok: "✓", error: "×", running: "●" };

/**
 * Тулы, у которых argv и служебный вывод дублируют то, что видно глазами.
 * `shot` и `view` кладут картинку в канал вложений: вместо JSON аргументов и
 * служебной строки «→ вложение» показываем имя файла и саму картинку.
 */
export const MEDIA_TOOLS = new Set(["view", "shot"]);

/**
 * Пути, которые смотрел или снял медиа-тул. `view` получает их массивом в
 * `args`, `shot` — один `--out-dir`, а имя файла появляется только в выводе
 * («…/x.png: image/png … → вложение x.png»). В ленте нужен путь, а не argv.
 */
export function mediaPaths(t: ToolRun): string[] {
  if (!MEDIA_TOOLS.has(t.name)) return [];
  const fromParts = (t.parts ?? []).map((p) => p.path);
  if (fromParts.length > 0) return fromParts;
  // Путь из первой строки вывода: до двоеточия.
  const first = t.preview.split("\n").find((l) => /\.[a-z0-9]+: /.test(l));
  if (first) return [first.slice(0, first.indexOf(":"))];
  return viewedPaths(t);
}

/** Есть ли у вызова вложения, которые человек захочет увидеть сразу. */
export const hasMedia = (t: ToolRun) =>
  Boolean(t.parts?.some((p) => p.kind === "image" || p.kind === "video" || p.kind === "audio"));

/**
 * Пути, которые смотрел `view`. Тул получает их массивом в `args`, и в ленте
 * нужны именно пути: argv вида `{"args": ["/a.png", "/b.png"]}` и служебная
 * строка «→ вложение» модели ничего не говорят.
 */
export function viewedPaths(t: ToolRun): string[] {
  if (t.name !== "view") return [];
  try {
    const v = JSON.parse(t.args);
    const raw = Array.isArray(v) ? v : (v.args ?? v.paths ?? []);
    return (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
  } catch {
    return [];
  }
}

/** Подпись вызова: имена файлов у медиа-тулов, иначе короткий argv. */
export function argLabel(t: ToolRun): string {
  const paths = mediaPaths(t);
  return paths.length > 0 ? paths.map((p) => p.split("/").pop()).join(", ") : shortArgs(t.args);
}
