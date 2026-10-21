import type { WindowBreakdown } from "../api";

/**
 * Окно контекста: расклад считает ядро (`GET /v1/sessions/{id}/context`) по той
 * же проекции промпта, что уедет провайдеру, и приводит к цифрам провайдера
 * калибровкой по прошлым ходам. Статьи — как в /context у Claude Code:
 * системный промпт, сообщения, вызовы тулов, их результаты, картинки.
 */
export function ContextWindow({
  breakdown,
  limit,
}: {
  breakdown: WindowBreakdown | null;
  limit: number;
}) {
  if (!breakdown) {
    return (
      <div className="context">
        <div className="context__head">
          <b>окно</b>
          <span>нет данных</span>
        </div>
      </div>
    );
  }
  const b = breakdown;
  const pct = limit > 0 ? Math.min(100, (b.total / limit) * 100) : 0;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const all: Array<[string, number, string]> = [
    ["system", b.system, "системный промпт"],
    ["messages", b.messages, "сообщения"],
    ["toolCalls", b.tool_calls, "вызовы тулов"],
    ["toolResults", b.tool_results, "результаты тулов"],
    ["images", b.images, "картинки"],
  ];
  const segs = all.filter(([, n]) => n > 0);
  return (
    <div className="context">
      <div className="context__head">
        <b>
          {fmt(b.total)} / {fmt(limit)}
        </b>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div
        className="context__bar"
        title={segs.map(([, n, t]) => `${t} ${Math.round(n)}`).join(" · ")}
      >
        {segs.map(([kind, n]) => (
          <span
            key={kind}
            className="context__seg"
            data-kind={kind}
            style={{ width: `${limit > 0 ? (n / limit) * 100 : 0}%` }}
          />
        ))}
        <span className="context__seg" data-kind="free" />
      </div>
      <div className="context__legend">
        {segs.map(([kind, n, title]) => (
          <span key={kind} title={`${Math.round(n).toLocaleString("ru-RU")} токенов`}>
            <i data-kind={kind} />
            {title} {fmt(n)}
          </span>
        ))}
        <span>
          <i data-kind="free" />
          свободно {fmt(Math.max(0, limit - b.total))}
        </span>
      </div>
      <div className="context__foot">
        {b.messages_count} сообщ. · {b.tool_calls_count} вызовов
      </div>
    </div>
  );
}
