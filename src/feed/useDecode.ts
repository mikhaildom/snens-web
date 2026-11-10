import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "../ui/dither";

const TAIL = 10;
const GLYPHS = "ABCDEFGHJKLMNPRSTUVXYZ0123456789";
/** Перебираем только буквы и цифры: разметка markdown остаётся целой. */
const WORD = /[\p{L}\p{N}]/u;

/**
 * Хвост стрима как «Terminal Cursor Decode»: свежие символы сначала
 * перебираются, потом встают на место, самые старые — первыми. Когда текст
 * перестал приходить, через 400 мс показывается как есть.
 */
export function useDecode(text: string): string {
  const [tick, setTick] = useState(0);
  const lastChange = useRef(0);
  const prev = useRef(text);
  const reduced = useRef(reducedMotion());

  useEffect(() => {
    if (text !== prev.current) {
      prev.current = text;
      lastChange.current = performance.now();
    }
  }, [text]);

  useEffect(() => {
    if (reduced.current) return;
    const t = setInterval(() => {
      if (performance.now() - lastChange.current < 450) setTick((n) => n + 1);
    }, 50);
    return () => clearInterval(t);
  }, []);

  if (reduced.current || performance.now() - lastChange.current > 400 || tick < 0) return text;
  const from = Math.max(0, text.length - TAIL);
  let out = text.slice(0, from);
  for (let k = from; k < text.length; k++) {
    const ch = text[k];
    const age = (text.length - k) / TAIL;
    out += !WORD.test(ch) || Math.random() < age * age ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return out;
}
