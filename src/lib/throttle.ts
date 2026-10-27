/**
 * Троттлинг живой прорисовки артефакта.
 *
 * Каждое обновление — новый документ (`srcdoc`), а значит перезапуск анимаций и
 * потеря состояния. Поэтому обновляем не на каждый токен, а по расписанию с
 * backoff и только если текст заметно вырос.
 *
 * Чистая функция: решение «рисовать сейчас или подождать» проверяется тестом, а
 * не наблюдением за миганием.
 */

/** Растущие интервалы: первые кадры частые (скелет), дальше — реже. */
export const INTERVALS = [500, 500, 500, 1000, 1000, 2000] as const;

/** Меньше этого прироста — обновление не стоит перезапуска документа. */
export const MIN_GROWTH = 400;

export interface RenderState {
  /** Когда отрисовали в прошлый раз (мс, `Date.now()`). */
  at: number;
  /** Длина тела на момент прошлой отрисовки. */
  bytes: number;
  /** Сколько отрисовок уже было: номер выбирает интервал. */
  round: number;
}

/** Интервал до следующего кадра по номеру раунда. */
export function intervalFor(round: number): number {
  return INTERVALS[Math.min(round, INTERVALS.length - 1)];
}

/**
 * Пора ли перерисовывать. `now` — текущее время, `state` — прошлая отрисовка,
 * `bytes` — текущая длина тела.
 */
export function shouldRender(now: number, state: RenderState, bytes: number): boolean {
  if (bytes <= state.bytes) return false;
  const due = state.at + intervalFor(state.round);
  if (now < due) return false;
  // Первый кадр рисуем всегда (даже 20 байт): пустой блок хуже, чем скелет.
  if (state.round === 0) return true;
  return bytes - state.bytes >= MIN_GROWTH;
}

/** Состояние после отрисовки. */
export function afterRender(now: number, bytes: number, round: number): RenderState {
  return { at: now, bytes, round: round + 1 };
}
