import { useCallback, useRef, type RefObject } from "react";

/**
 * Курсор-прямоугольник, как в терминале. Настоящая каретка спрятана
 * (`caret-color: transparent`), а положение берётся из зеркала: невидимый
 * блок с тем же шрифтом и шириной, куда копируется текст до каретки.
 *
 * Высота — от верха заглавной до низа хвоста строчной, по самому шрифту.
 * `getComputedStyle().font` бывает пустым (при `font-feature-settings` и
 * подобном), поэтому шрифт собирается по частям.
 */
export function useBlockCursor(area: RefObject<HTMLTextAreaElement | null>) {
  const mirRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const metrics = useRef<{ font: string; up: number; down: number } | null>(null);

  const place = useCallback(() => {
    requestAnimationFrame(() => {
      const ta = area.current;
      const m = mirRef.current;
      const cur = curRef.current;
      if (!ta || !m || !cur) return;
      if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) {
        cur.style.opacity = "0";
        return;
      }
      const css = getComputedStyle(ta);
      const font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const fs = parseFloat(css.fontSize) || 15;
      m.style.width = `${ta.clientWidth}px`;
      m.style.padding = css.padding;
      m.style.fontFamily = css.fontFamily;
      m.style.fontSize = css.fontSize;
      m.style.fontWeight = css.fontWeight;
      m.style.lineHeight = css.lineHeight;
      m.style.letterSpacing = css.letterSpacing;
      m.textContent = ta.value.slice(0, ta.selectionStart);
      const bl = document.createElement("span");
      bl.style.cssText = "display:inline-block;width:0;height:0";
      m.appendChild(bl);
      if (!metrics.current || metrics.current.font !== font) {
        const x = document.createElement("canvas").getContext("2d");
        let up = fs * 0.7;
        let down = fs * 0.2;
        if (x) {
          x.font = font;
          up = x.measureText("Н").actualBoundingBoxAscent || up;
          down = x.measureText("р").actualBoundingBoxDescent || down;
        }
        metrics.current = { font, up, down };
      }
      const { up, down } = metrics.current;
      const top = Math.round(bl.offsetTop - up);
      cur.style.height = `${Math.round(up + down)}px`;
      cur.style.width = `${Math.round(fs * 0.5)}px`;
      cur.style.transform = `translate(${ta.offsetLeft + bl.offsetLeft + 1}px, ${ta.offsetTop + top - ta.scrollTop}px)`;
      cur.style.opacity = "1";
      cur.style.animation = "none";
      void cur.offsetWidth;
      cur.style.animation = "";
    });
  }, [area]);

  return { mirRef, curRef, place };
}
