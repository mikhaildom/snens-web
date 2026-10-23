/**
 * Высота поля ввода по содержимому — чистая арифметика, без DOM.
 *
 * Отдельным модулем, потому что правило хочется проверить тестом (`node --test`
 * не умеет в layout), а не глазами на скриншоте: как только логика съезжает,
 * поле либо обрезает последнюю строку, либо занимает пол-экрана и его
 * внутренний скролл появляется раньше, чем человек успевает набрать абзац.
 */

/**
 * Высота textarea в px.
 *
 * `scrollHeight` — сколько содержимое просит; `maxHeight` — предел окна
 * (App считает его как долю высоты окна). Итог не меньше одной строки: пустое
 * поле с нулевой высотой выглядело бы как «сломалось». Рамки (`border-box`)
 * уже учтены: к высоте прибавлять ничего не нужно, стили задают
 * `box-sizing: border-box` глобально.
 */
export function autosize(scrollHeight: number, maxHeight: number, minHeight = 0): number {
  const want = Number.isFinite(scrollHeight) ? scrollHeight : 0;
  const cap = Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : Infinity;
  const floor = Number.isFinite(minHeight) && minHeight > 0 ? minHeight : 0;
  return Math.max(floor, Math.min(want, cap));
}

/** Нужен ли внутренний скролл: содержимое не влезло в предел. */
export function needsScroll(scrollHeight: number, maxHeight: number): boolean {
  return Number.isFinite(scrollHeight) && Number.isFinite(maxHeight) && maxHeight > 0
    ? scrollHeight > maxHeight
    : false;
}

/**
 * Предел высоты поля — доля высоты окна.
 *
 * 40% — не круглая цифра, а эмпирика: при 50% поле в половину экрана
 * перекрывает ленту, при 33% в него не влезает сообщение на пять строк.
 * Верхний потолок нужен, чтобы на очень большом мониторе поле не выросло в
 * бесконечность, а прокрутка появлялась на тех же пяти-шести строках.
 */
export function maxHeightFor(viewportHeight: number, share = 0.4, ceiling = 320): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return ceiling;
  return Math.max(96, Math.min(Math.round(viewportHeight * share), ceiling));
}
