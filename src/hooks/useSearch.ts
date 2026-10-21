import { useEffect, useState } from "react";
import { api, type SearchHit } from "../api";

/**
 * Поиск по журналам: дебаунс 300 мс, чтобы не дёргать ядро на каждую букву.
 *
 * Состояние — последний *завершённый* запрос (`res.q`). Тогда «идёт поиск» и
 * «показать выдачу» выводятся из сравнения с текущим запросом, а не из
 * отдельного флага, который пришлось бы дёргать синхронно из эффекта.
 */
export function useSearch(query: string, onError: (e: string) => void) {
  const [res, setRes] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    const t = setTimeout(() => {
      api
        .search(q, 40)
        .then((r) => setRes({ q, hits: r.hits }))
        .catch((e) => {
          onError(String(e instanceof Error ? e.message : e));
          setRes({ q, hits: [] });
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, onError]);

  return { hits: res.q === q ? res.hits : [], searching: Boolean(q) && res.q !== q };
}
