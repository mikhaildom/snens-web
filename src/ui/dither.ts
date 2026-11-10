/**
 * Общее для пиксельных полей: матрица Байера 8×8, цвет акцента из CSS и
 * признак «меньше движения». Дизер рисуется в маленький canvas, а растягивает
 * его CSS (`image-rendering: pixelated`), поэтому одна точка = одна клетка.
 */
export const BAYER: number[][] = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
].map((r) => r.map((v) => (v + 0.5) / 64));

/** Цвет из CSS-переменной `--accent` (или другой) как [r, g, b]. */
export function cssRgb(el: Element, name = "--accent"): [number, number, number] {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  const hex = raw.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const m = raw.match(/\d+(\.\d+)?/g);
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [126, 232, 181];
}

export function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Один общий таймер кадров на все поля: ~26 кадров в секунду хватает для
 * пикселей и не греет ноутбук. Подписчик получает время в мс.
 */
const subs = new Set<(now: number) => void>();
let raf = 0;
let last = 0;
function loop(now: number) {
  raf = requestAnimationFrame(loop);
  if (now - last < 38) return;
  last = now;
  for (const fn of subs) fn(now);
}
export function onFrame(fn: (now: number) => void): () => void {
  subs.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

