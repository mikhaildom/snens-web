import type { WindowBreakdown } from "../api";

/**
 * Окно контекста: расклад считает ядро (`GET /v1/sessions/{id}/context`).
 * Части различаются оттенками акцента, у каждой токены и доля от лимита.
 */
export function ContextWindow({
  breakdown,
  limit,
}: {
  breakdown: WindowBreakdown | null;
  limit: number;
}) {
  if (!breakdown) {
    return <div className="dock-empty">Окно ещё не посчитано. Оно появится после первого хода.</div>;
  }
  const b = breakdown;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));
  const pct = (n: number) => (limit > 0 ? (n / limit) * 100 : 0);
  const pf = (n: number) => {
    const v = pct(n);
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;
  };
  const all: Array<[string, number, string]> = [
    ["c1", b.system, "Системный промпт"],
    ["c2", b.messages, "Сообщения"],
    ["c3", b.tool_calls, "Вызовы тулов"],
    ["c4", b.tool_results, "Результаты"],
    ["c5", b.images, "Картинки"],
  ];
  const segs = all.filter(([, n]) => n > 0);
  const free = Math.max(0, limit - b.total);
  return (
    <div className="dock-ctx">
      <div className="bignum">
        {fmt(b.total)} <small>из {fmt(limit)}, {pf(b.total)}</small>
      </div>
      <div className="seg" aria-hidden="true">
        {segs.map(([k, n]) => (
          <i key={k} className={k} style={{ width: `${pct(n)}%` }} />
        ))}
      </div>
      <div className="leg">
        {segs.map(([k, n, title]) => (
          <div key={k} className="leg-r">
            <b className={k} />
            <span>{title}</span>
            <span className="n">{fmt(n)}</span>
            <span className="n">{pf(n)}</span>
          </div>
        ))}
        <div className="leg-r">
          <b className="c0" />
          <span>Свободно</span>
          <span className="n">{fmt(free)}</span>
          <span className="n">{pf(free)}</span>
        </div>
      </div>
    </div>
  );
}
