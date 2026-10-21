/** Мелкие форматтеры подписей. */

/** «1 шаг / 2 шага / 5 шагов». */
export function stepsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "шаг";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "шага";
  return "шагов";
}

/** Аргументы вызова одной строкой: разбираем JSON, но не падаем на не-JSON. */
export function shortArgs(raw: string): string {
  try {
    const v = JSON.parse(raw);
    const first = v.cmd ?? v.path ?? v.url ?? v.query ?? v.args?.[0] ?? v.text ?? Object.values(v)[0];
    const s = Array.isArray(first) ? first.join(" ") : String(first ?? "");
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  } catch {
    return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
  }
}

/** Ссылка на файл сессии: картинки, видео, голосовые идут через вложение. */
export const fileUrl = (session: string, path: string) =>
  `/api/v1/sessions/${session}/file?path=${encodeURIComponent(path)}`;
