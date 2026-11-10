import { useEffect, useRef, useState } from "react";
import { BAYER, cssRgb, onFrame, reducedMotion } from "../ui/dither";

export type WaveKind = "think" | "tool" | "wait";

const CELL = 3;
const ROWS = 6;

/**
 * Пиксельная полоса, пока агент работает: ровный тусклый фон и бегущие внутри
 * импульсы. Думает — одна длинная волна, тулы — две короткие и быстрые,
 * ожидание подтверждения — тихая рябь от центра. Рядом статус и таймер хода.
 */
export function WorkWave({ kind, label, since }: { kind: WaveKind; label: string; since: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const reduced = reducedMotion();
    let img: ImageData | null = null;
    return onFrame((ms) => {
      const W = c.clientWidth;
      if (!W) return;
      const cols = Math.ceil(W / CELL);
      if (c.width !== cols || c.height !== ROWS) {
        c.width = cols;
        c.height = ROWS;
        img = null;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      if (!img) img = ctx.createImageData(cols, ROWS);
      const d = img.data;
      const [r, g, b] = cssRgb(c);
      const t = reduced ? 3 : ms / 1000;
      const k = kindRef.current;
      const mid = (ROWS - 1) / 2;
      const period = cols * 1.35;
      const packet = (x: number, speed: number, width: number, shift: number) => {
        const head = (t * speed * cols + shift * period) % period;
        const dist = head - x;
        const q = (dist < 0 ? dist + period : dist) / width;
        return Math.exp(-q * q) + 0.45 * Math.exp((-q * q) / 5) * (0.5 + 0.5 * Math.sin(q * 5));
      };
      const breath = 0.8 + 0.2 * Math.sin(t * 2.6);
      for (let y = 0, i = 0; y < ROWS; y++) {
        const row = BAYER[y & 7];
        const cross = 1 - (0.4 * Math.abs(y - mid)) / mid;
        for (let x = 0; x < cols; x++, i++) {
          let a = 0.13;
          if (k === "think") a += packet(x, 0.38, cols * 0.11, 0) * breath * cross;
          else if (k === "tool")
            a += Math.max(packet(x, 0.72, cols * 0.05, 0), packet(x, 0.72, cols * 0.05, 0.5)) * breath * cross;
          else {
            const dist = Math.abs(x - cols / 2);
            a += 0.32 * (0.5 + 0.5 * Math.sin(dist * 0.16 - t * 2.2)) * (0.65 + 0.35 * Math.sin(t * 1.4)) * cross;
          }
          const j = i * 4;
          if (a > row[x & 7]) {
            d[j] = r;
            d[j + 1] = g;
            d[j + 2] = b;
            d[j + 3] = 255;
          } else d[j + 3] = 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  }, []);

  const secs = Math.max(0, Math.floor((now - since) / 1000));
  const elapsed = secs < 60 ? `${secs} с` : `${Math.floor(secs / 60)} мин ${secs % 60} с`;
  return (
    <div className="working" role="status">
      <canvas ref={ref} className="wave" aria-hidden="true" />
      <div className="working__row">
        <span>{label}</span>
        <span className="working__t">{elapsed}</span>
      </div>
    </div>
  );
}
