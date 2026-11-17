import { useState } from "react";
import type { Usage } from "../api";
import { Icon } from "../ui/icons";

const n = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
const money = (c: number) => `$${c < 0.01 ? c.toFixed(4) : c.toFixed(3)}`;

/**
 * Токены и цена ответа: значок «i» и всплывашка с входом, попаданием и
 * промахом кеша, выходом и ценой. Видна при наведении и по клику (на тач-экране
 * наведения нет). Цена рядом со значком — единственная цифра на виду.
 */
export function UsageInfo({ u }: { u: Usage }) {
  const [open, setOpen] = useState(false);
  const miss = Math.max(0, u.in_tok - u.cached_tok);
  const pct = u.in_tok > 0 ? Math.round((u.cached_tok / u.in_tok) * 100) : 0;
  const cost = u.cost_micro / 1_000_000;
  return (
    <span className="info-w" data-open={open}>
      <button
        className="info"
        aria-label="токены и цена ответа"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="info" size={14} />
      </button>
      <span className="stat" role="note">
        <span className="stat-r">
          <span>Вход</span>
          <b>{n(u.in_tok)}</b>
        </span>
        <span className="stat-r" data-sub="yes">
          <span>Кеш: попадание</span>
          <span>{n(u.cached_tok)}</span>
        </span>
        <span className="stat-r" data-sub="yes">
          <span>Кеш: промах</span>
          <span>{n(miss)}</span>
        </span>
        <span className="stat-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="stat-r">
          <span>Выход</span>
          <b>{n(u.out_tok)}</b>
        </span>
        {u.reason_tok > 0 && (
          <span className="stat-r" data-sub="yes">
            <span>Из них размышления</span>
            <span>{n(u.reason_tok)}</span>
          </span>
        )}
        <span className="stat-r stat-top">
          <span>Цена</span>
          <b>{money(cost)}</b>
        </span>
      </span>
      <span className="info-cost">{money(cost)}</span>
    </span>
  );
}

/** Старое имя: места, где расход стоял в шапке, теперь получают значок. */
export const UsageBar = UsageInfo;
