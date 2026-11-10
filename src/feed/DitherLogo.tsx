import { useEffect, useRef } from "react";
import { BAYER, cssRgb, onFrame, reducedMotion } from "../ui/dither";

const CELL = 3;

/**
 * Логотип дизером: контур букв берётся из шрифта заголовков (`--head`), по ним
 * идёт медленная волна плотности. Шрифт подгружается позже первого кадра —
 * после загрузки маска пересобирается.
 */
export function DitherLogo() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const reduced = reducedMotion();
    let mask: Uint8Array | null = null;
    let img: ImageData | null = null;
    let font = "";
    let done = false;

    const headFont = () => {
      const css = getComputedStyle(c);
      const fam = css.getPropertyValue("--head").trim() || "Geist, sans-serif";
      const w = css.getPropertyValue("--head-w").trim() || "500";
      const track = parseFloat(css.getPropertyValue("--head-track")) || 0;
      return { fam, w, track };
    };
    const h = headFont();
    document.fonts?.load(`${h.w} 100px ${h.fam}`).then(() => {
      mask = null;
      done = false;
    });

    const build = (cols: number, rows: number) => {
      const { fam, w, track } = headFont();
      const o = document.createElement("canvas");
      o.width = cols;
      o.height = rows;
      const x = o.getContext("2d", { willReadFrequently: true });
      if (!x) return new Uint8Array(cols * rows);
      const f = (n: number) => `${w} ${n}px ${fam}`;
      const sp = (n: number) => {
        if ("letterSpacing" in x) (x as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${track * n}px`;
      };
      x.textBaseline = "alphabetic";
      x.font = f(100);
      sp(100);
      const m = x.measureText("snens");
      const k = Math.min(
        cols / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight),
        rows / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent),
      );
      x.font = f(100 * k);
      sp(100 * k);
      x.fillText("snens", m.actualBoundingBoxLeft * k, m.actualBoundingBoxAscent * k);
      const src = x.getImageData(0, 0, cols, rows).data;
      const out = new Uint8Array(cols * rows);
      for (let i = 0; i < out.length; i++) out[i] = src[i * 4 + 3] > 110 ? 1 : 0;
      font = f(100);
      return out;
    };

    const off = onFrame((now) => {
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (!W || !H) return;
      const cols = Math.ceil(W / CELL);
      const rows = Math.ceil(H / CELL);
      const want = `${headFont().w} 100px ${headFont().fam}`;
      if (c.width !== cols || c.height !== rows || !mask || want !== font) {
        c.width = cols;
        c.height = rows;
        mask = build(cols, rows);
        img = null;
        done = false;
      }
      if (reduced && done) return;
      done = true;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      if (!img) img = ctx.createImageData(cols, rows);
      const d = img.data;
      const [r, g, b] = cssRgb(c);
      const t = reduced ? 2 : now / 1000;
      for (let y = 0, i = 0; y < rows; y++) {
        const row = BAYER[y & 7];
        for (let x = 0; x < cols; x++, i++) {
          const j = i * 4;
          const a = 0.72 + 0.28 * Math.sin((x / cols) * 7 - t * 1.1 + (y / rows) * 2);
          if (mask[i] && a > row[x & 7]) {
            d[j] = r;
            d[j + 1] = g;
            d[j + 2] = b;
            d[j + 3] = 255;
          } else d[j + 3] = 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
    return () => {
      off();
    };
  }, []);
  return <canvas ref={ref} className="logo-d" role="img" aria-label="snens" />;
}
