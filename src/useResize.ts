import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Тяга за край панели: ширина в px, границы, сохранение в localStorage.
 * dir = 1 — тянем правый край (ширина растёт вправо), -1 — левый.
 * Слушатели вешаются на document: pointer capture в мок-событиях и в iframe
 * кидает InvalidPointerId, а без него тяга рвётся.
 */
export function useResize(
  key: string,
  initial: number,
  min: number,
  max: number,
  dir: 1 | -1,
) {
  const [size, setSize] = useState<number>(() => {
    const raw = Number(localStorage.getItem(key));
    return Number.isFinite(raw) && raw >= min && raw <= max ? raw : initial;
  });
  const sizeRef = useRef(size);
  const drag = useRef<{ x: number; start: number } | null>(null);

  const commit = useCallback((v: number) => {
    sizeRef.current = v;
    setSize(v);
  }, []);

  useEffect(() => {
    function move(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const next = Math.min(max, Math.max(min, d.start + (e.clientX - d.x) * dir));
      commit(next);
      e.preventDefault();
    }
    function up() {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(key, String(sizeRef.current));
    }
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, [commit, dir, key, max, min]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    drag.current = { x: e.clientX, start: sizeRef.current };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const reset = useCallback(() => {
    commit(initial);
    localStorage.setItem(key, String(initial));
  }, [commit, initial, key]);

  return {
    size,
    reset,
    gripProps: {
      onPointerDown,
      onDoubleClick: reset,
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-valuenow": size,
      "aria-valuemin": min,
      "aria-valuemax": max,
      tabIndex: 0,
      onKeyDown: (e: React.KeyboardEvent) => {
        const d = e.key === "ArrowRight" ? 16 * dir : e.key === "ArrowLeft" ? -16 * dir : 0;
        if (!d) return;
        e.preventDefault();
        const next = Math.min(max, Math.max(min, sizeRef.current + d));
        commit(next);
        localStorage.setItem(key, String(next));
      },
    },
  };
}
