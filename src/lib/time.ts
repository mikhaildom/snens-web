/** Время в ленте: абсолютное (шапки) и относительное (список сессий). */

/** «14:07». */
export const time = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/**
 * Сколько времени подагент работал: «42с» / «3м 12с» / «1ч 04м».
 * Отдельно от `dur` (тот про миллисекунды одного вызова тула и с десятыми).
 */
export function worked(ms?: number): string {
  if (ms == null) return "";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}с`;
  const min = Math.floor(total / 60);
  if (min < 60) return `${min}м ${String(total % 60).padStart(2, "0")}с`;
  const h = Math.floor(min / 60);
  return `${h}ч ${String(min % 60).padStart(2, "0")}м`;
}

/** Длительность вызова: «820ms» / «3.4s». */
export const dur = (ms?: number) =>
  ms == null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

/** «только что / 12 мин / 3 ч / вчера 14:07 / 21 окт». */
export function relTime(ts?: number): string {
  if (!ts) return "";
  const now = Date.now() / 1000;
  const d = Math.max(0, now - ts);
  if (d < 60) return "только что";
  if (d < 3600) return `${Math.floor(d / 60)} мин`;
  const date = new Date(ts * 1000);
  const hm = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `${Math.floor(d / 3600)} ч`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `вчера ${hm}`;
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
