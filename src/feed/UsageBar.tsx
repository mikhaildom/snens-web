import type { Usage } from "../api";

/**
 * Расход хода: кеш-хит (с иконкой базы), кеш-мисс/выход и цена. Всё, кроме
 * иконки с процентом, выводится целиком, но появляется только при ховере на
 * сообщение или шаг (см. `.usage` в CSS): в спокойном чтении цифры не нужны.
 */
export function UsageBar({ u }: { u: Usage }) {
  const hit = u.in_tok > 0 ? Math.round((u.cached_tok / u.in_tok) * 100) : 0;
  const miss = u.in_tok - u.cached_tok;
  const cost = u.cost_micro / 1_000_000;
  return (
    <span
      className="usage"
      title={[
        `вход ${u.in_tok.toLocaleString("ru-RU")}`,
        `кеш ${u.cached_tok.toLocaleString("ru-RU")}`,
        `без кеша ${miss.toLocaleString("ru-RU")}`,
        `выход ${u.out_tok.toLocaleString("ru-RU")}`,
        u.reason_tok > 0 ? `рассуждение ${u.reason_tok.toLocaleString("ru-RU")}` : "",
        `цена $${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <span className="usage__hit">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" className="usage__db">
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
          <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
        </svg>
        {hit}%
      </span>
      <span className="usage__dim">
        {miss}/{u.out_tok}
      </span>
      <span className="usage__cost">${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}</span>
    </span>
  );
}
