import { useEffect, useRef } from "react";
import { BAYER, cssRgb, onFrame, reducedMotion } from "../ui/dither";

const FORMS = ["wave", "clouds", "casey", "rays", "dunes"] as const;
type Form = (typeof FORMS)[number];
const CELL = 4;

/**
 * Живой дизер на весь центр первого экрана. Форма меняется с каждым показом,
 * поле откликается на набор текста, при отправке рассыпается
 * волной от поля ввода, а при возврате к приветствию прорастает обратно.
 *
 * Компонент смонтирован всегда, видимость — пропом `on`: иначе анимации ухода
 * было бы не на чем играть.
 */
export function DitherField({ on, form = "auto" }: { on: boolean; form?: Form | "auto" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({
    on: false,
    visible: false,
    form: FORMS[Math.floor(Math.random() * FORMS.length)] as Form,
    fx: null as null | { mode: "in" | "out"; t0: number; dur: number },
    ptr: null as null | { x: number; y: number },
    hash: null as Float32Array | null,
    img: null as ImageData | null,
    reduced: reducedMotion(),
    drawn: "",
    fixed: null as Form | null,
  });

  // Форма из настроек: «auto» оставляет смену при каждом показе.
  useEffect(() => {
    const s = st.current;
    s.fixed = form === "auto" ? null : form;
    if (s.fixed) s.form = s.fixed;
    s.drawn = "";
  }, [form]);

  // Смена видимости: появление и уход играются здесь, а не в CSS.
  useEffect(() => {
    const s = st.current;
    if (on && !s.on) {
      s.on = true;
      if (!s.visible && !s.fixed) s.form = FORMS[(FORMS.indexOf(s.form) + 1) % FORMS.length];
      s.visible = true;
      s.fx = s.reduced ? null : { mode: "in", t0: performance.now(), dur: 640 };
    } else if (!on && s.on) {
      s.on = false;
      s.fx = { mode: "out", t0: performance.now(), dur: s.reduced ? 1 : 620 };
    }
  }, [on]);

  useEffect(() => {
    const s = st.current;
    const c = ref.current;
    if (!c) return;
    return onFrame((now) => draw(c, s, now));
  }, []);

  return <canvas ref={ref} className="field" aria-hidden="true" />;
}

function draw(c: HTMLCanvasElement, s: ReturnType<typeof stateShape>, now: number) {
  if (!s.visible) return;
  const W = c.clientWidth;
  const H = c.clientHeight;
  if (!W || !H) return;
  const cw = Math.ceil(W / CELL);
  const ch = Math.ceil(H / CELL);
  if (c.width !== cw || c.height !== ch || !s.hash) {
    c.width = cw;
    c.height = ch;
    s.img = null;
    s.hash = new Float32Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) s.hash[i] = Math.random();
  }
  const ctx = c.getContext("2d");
  if (!ctx) return;
  if (!s.img) s.img = ctx.createImageData(cw, ch);
  const key = `${s.form}${cw}x${ch}`;
  if (s.reduced && !s.fx && s.drawn === key) return;
  s.drawn = key;
  const t = s.reduced ? 12 : now / 1000;
  const [r, g, b] = cssRgb(c);
  const d = s.img.data;
  const ox = cw / 2;
  const oy = ch - 22;
  const maxd = Math.hypot(Math.max(ox, cw - ox), oy) || 1;
  const aspect = ch / cw;
  let p = 0;
  const mode = s.fx?.mode ?? null;
  if (s.fx) p = Math.min(1, (now - s.fx.t0) / s.fx.dur);
  const balls: Array<[number, number, number]> = [];
  if (s.form === "clouds") {
    for (let k = 0; k < 6; k++) {
      balls.push([
        0.5 + 0.46 * Math.sin(t * (0.11 + k * 0.023) + k * 2.1),
        aspect * (0.5 + 0.46 * Math.cos(t * (0.09 + k * 0.019) + k * 1.3)),
        0.012 + 0.012 * (k % 3),
      ]);
    }
  }
  for (let y = 0, i = 0; y < ch; y++) {
    const row = BAYER[y & 7];
    const v = y / cw;
    for (let x = 0; x < cw; x++, i++) {
      const u = x / cw;
      let a = 0;
      if (s.form === "wave") {
        const w = v + 0.055 * Math.sin(u * 7 + t * 0.7) + 0.03 * Math.sin(u * 17 - t * 1.1);
        a = (0.5 + 0.5 * Math.sin(w * 46)) * (0.18 + 0.82 * (0.5 + 0.5 * Math.sin(u * 2.6 - t * 0.22 + v * 4)));
      } else if (s.form === "clouds") {
        for (let k = 0; k < 6; k++) {
          const dx = u - balls[k][0];
          const dy = v - balls[k][1];
          a += 0.95 * Math.exp(-(dx * dx + dy * dy) / balls[k][2]);
        }
      } else if (s.form === "casey") {
        const bx = (x / 16) | 0;
        const by = (y / 11) | 0;
        const f = 0.5 + 0.5 * Math.sin(bx * 0.55 + Math.sin(by * 0.35 + t * 0.18) * 2.2 + t * 0.12);
        const h = 0.5 + 0.5 * Math.sin(by * 0.42 - t * 0.15 + bx * 0.12);
        a = (Math.round((f * 0.7 + h * 0.5) * 5) / 5) * (x % 6 < 3 ? 1 : 0.22);
      } else if (s.form === "rays") {
        const dx = u - 0.5;
        const dy = v - aspect * 0.5;
        const dd = Math.hypot(dx, dy);
        a =
          (0.5 + 0.5 * Math.sin(Math.atan2(dy, dx) * 11 + t * 0.35 + dd * 3)) *
          Math.min(1, dd * 2.1) *
          (0.55 + 0.45 * Math.sin(dd * 22 - t * 1.6));
      } else {
        const sv = 0.5 + 0.5 * Math.sin((u * 0.8 + v) * 60 + 5 * Math.sin(v * 6 + t * 0.35) + 3 * Math.sin(u * 5 - t * 0.25));
        a = sv * Math.min(1, (Math.sin(u * 2.1 + v * 3.3 - t * 0.2) + 1) * 0.6);
      }
      if (mode) {
        const dn = Math.hypot(x - ox, y - oy) / maxd + s.hash![i] * 0.16;
        const f = p * 1.36;
        if (mode === "out") {
          if (dn < f - 0.14) a = 0;
          else if (dn < f) a = 1;
        } else if (dn > f) a = 0;
        else if (dn > f - 0.1) a = 1;
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
  ctx.putImageData(s.img, 0, 0);
  if (s.fx && p >= 1) {
    if (s.fx.mode === "out") {
      s.visible = false;
      ctx.clearRect(0, 0, cw, ch);
    }
    s.fx = null;
  }
}

// Форма состояния для типизации `draw` без экспорта лишних типов.
function stateShape() {
  return {
    on: false,
    visible: false,
    form: "wave" as Form,
    fx: null as null | { mode: "in" | "out"; t0: number; dur: number },
    ptr: null as null | { x: number; y: number },
    hash: null as Float32Array | null,
    img: null as ImageData | null,
    reduced: false,
    drawn: "",
    fixed: null as Form | null,
  };
}
