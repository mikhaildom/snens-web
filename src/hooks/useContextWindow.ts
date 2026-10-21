import { useCallback, useEffect, useState } from "react";
import { api, type WindowBreakdown } from "../api";
import { CTX_LIMIT } from "../lib/context";

type Ctx = { breakdown: WindowBreakdown | null; limit: number };

/**
 * Расклад окна контекста: считает ядро, обновляем на смену сессии и после
 * каждого хода — в ходе он устаревает.
 *
 * Сброс живёт в `select`: синхронный setState в эффекте давал лишний рендер.
 */
export function useContextWindow(active: string | null, turns: number, running: boolean) {
  const [ctx, setCtx] = useState<Ctx>({ breakdown: null, limit: CTX_LIMIT });

  const reset = useCallback(() => setCtx({ breakdown: null, limit: CTX_LIMIT }), []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    api
      .context(active)
      .then((c) => {
        if (alive) setCtx({ breakdown: c.breakdown, limit: c.limit || CTX_LIMIT });
      })
      .catch(() => {
        /* закрытая/удалённая сессия — оставляем пустой расклад */
      });
    return () => {
      alive = false;
    };
  }, [active, turns, running]);

  return { ...ctx, reset };
}
