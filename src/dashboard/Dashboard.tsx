import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import {
  applyFilters,
  DEFAULT_FILTERS,
  distinct,
  filtersFromQuery,
  filtersToQuery,
  nextSort,
  type Filters,
  type Review,
  type SortKey,
  type Ticket,
} from "./filters";
import { ReviewCard } from "./ReviewCard";
import { TicketCard } from "./TicketCard";

export type DashTab = "tickets" | "reviews";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "date", label: "дата" },
  { key: "hits", label: "hits" },
  { key: "weight", label: "вес" },
  { key: "name", label: "имя" },
];

/**
 * Дашборд: отдельная страница приложения, а не модалка.
 *
 * Почему страница: тикетов сотни, у каждого раскрывается тело — в модалке с
 * фиксированной высотой это скролл внутри скролла. Состояние (вкладка +
 * фильтры) живёт в URL, чтобы ссылка открывала тот же вид: тот же приём, что
 * `?dock` и `?settings`, и он ничего не стоит.
 *
 * Тела тикетов кешируются по имени (`bodies`): раскрыть-закрыть карточку не
 * должно ходить в ядро повторно, а список открывается мгновенно независимо
 * от размера текстов.
 */
export function Dashboard({
  onClose,
  onOpenSession,
  onError,
}: {
  onClose: () => void;
  /** Переход в сессию — тем же путём, что карточки подагентов (`push`). */
  onOpenSession: (session: string) => void;
  onError: (e: string) => void;
}) {
  const [tab, setTab] = useState<DashTab>(() =>
    new URLSearchParams(location.search).get("dashTab") === "reviews" ? "reviews" : "tickets",
  );
  const [filters, setFilters] = useState<Filters>(() => filtersFromQuery(new URLSearchParams(location.search)));

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Тела тикетов: `name → markdown`. Кеш живёт столько же, сколько страница. */
  const bodies = useRef(new Map<string, string>());
  const [bodyTick, setBodyTick] = useState(0);
  const [bodyLoading, setBodyLoading] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  // Тикеты и ревью — независимо: вкладка «ревью» не должна ждать тикетов,
  // а падение одного списка не должно гасить другой.
  useEffect(() => {
    let alive = true;
    api
      .tickets()
      .then((t) => alive && setTickets(t))
      .catch((e) => {
        if (!alive) return;
        setTickets([]);
        onError(String(e instanceof Error ? e.message : e));
      });
    api
      .reviews()
      .then((r) => alive && setReviews(r))
      .catch(() => alive && setReviews([]));
    return () => {
      alive = false;
    };
  }, [onError]);

  /**
   * Правка фильтров сразу уезжает в адрес: `replaceState`, а не `pushState` —
   * каждый щелчок по фильтру не должен добавлять шаг в историю. Возврат из
   * дашборда делает `history.back()`, и это ровно «куда пришёл».
   */
  const patch = useCallback((p: Partial<Filters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...p };
      const url = new URL(location.href);
      url.search = filtersToQuery(next, new URLSearchParams(location.search)).toString();
      if (url.pathname + url.search !== location.pathname + location.search) {
        history.replaceState(history.state, "", url);
      }
      return next;
    });
  }, []);

  const switchTab = useCallback((t: DashTab) => {
    setTab(t);
    const url = new URL(location.href);
    if (t === "reviews") url.searchParams.set("dashTab", "reviews");
    else url.searchParams.delete("dashTab");
    history.replaceState(history.state, "", url);
  }, []);

  /** Раскрытие карточки: тело тянем один раз, повторно — из кеша. */
  const toggle = useCallback(
    (name: string) => {
      if (expanded === name) {
        setExpanded(null);
        return;
      }
      setExpanded(name);
      setBodyError(null);
      if (bodies.current.has(name)) return;
      setBodyLoading(name);
      api
        .ticket(name)
        .then((t) => {
          bodies.current.set(name, t.body);
          setBodyTick((n) => n + 1);
        })
        .catch((e) => setBodyError(String(e instanceof Error ? e.message : e)))
        .finally(() => setBodyLoading((cur) => (cur === name ? null : cur)));
    },
    [expanded],
  );

  const kinds = useMemo(() => (tickets ? distinct(tickets, "kind") : []), [tickets]);
  const weights = useMemo(() => (tickets ? distinct(tickets, "weight") : []), [tickets]);
  const shown = useMemo(() => (tickets ? applyFilters(tickets, filters) : []), [tickets, filters]);
  // bodyTick в зависимостях: кеш — ref, React о нём не знает.
  const bodyOf = useCallback((name: string) => bodies.current.get(name) ?? null, [bodyTick]);

  const f = filters;

  return (
    <div className="dash">
      <header className="dash__bar">
        <button className="ghost dash__back" onClick={onClose} title="назад к ленте">
          ← назад
        </button>
        <div className="dash__tabs" role="tablist">
          <button role="tab" aria-selected={tab === "tickets"} onClick={() => switchTab("tickets")}>
            тикеты {tickets ? <b>{tickets.length}</b> : null}
          </button>
          <button role="tab" aria-selected={tab === "reviews"} onClick={() => switchTab("reviews")}>
            ревью {reviews ? <b>{reviews.length}</b> : null}
          </button>
        </div>
        <span className="dash__count">{tab === "tickets" ? `показано ${shown.length}` : ""}</span>
      </header>

      {tab === "tickets" ? (
        <>
          <div className="dash__filters">
            <input
              className="dash__search"
              value={f.query}
              placeholder="поиск по имени и симптому"
              onChange={(e) => patch({ query: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") patch({ query: "" });
              }}
            />
            <label className="dash__field">
              статус
              <select value={f.status} onChange={(e) => patch({ status: e.target.value as Filters["status"] })}>
                <option value="all">все</option>
                <option value="open">открытые</option>
                <option value="closed">закрытые</option>
              </select>
            </label>
            <label className="dash__field">
              kind
              <select value={f.kind} onChange={(e) => patch({ kind: e.target.value })}>
                <option value="">любой</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash__field">
              hits
              <select value={f.hits} onChange={(e) => patch({ hits: e.target.value as Filters["hits"] })}>
                <option value="all">любые</option>
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2+">2+</option>
                <option value="3+">3+</option>
              </select>
            </label>
            <label className="dash__field">
              вес
              <select value={f.weight} onChange={(e) => patch({ weight: e.target.value })}>
                <option value="">любой</option>
                {weights.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash__field">
              дата
              <select value={f.date} onChange={(e) => patch({ date: e.target.value as Filters["date"] })}>
                <option value="all">всё</option>
                <option value="7">7 дней</option>
                <option value="30">30 дней</option>
              </select>
            </label>
            <span className="dash__sorts">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  className="dash__sort"
                  aria-pressed={f.sort === s.key}
                  // Стрелка показывает, куда отсортировано: без неё нажатие
                  // «hits» дважды выглядит как «ничего не произошло».
                  onClick={() => patch(nextSort(f, s.key))}
                >
                  {s.label}
                  {f.sort === s.key ? (f.dir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </span>
            <button className="ghost dash__reset" onClick={() => patch(DEFAULT_FILTERS)}>
              сброс
            </button>
          </div>

          {tickets === null && <p className="dash__muted">загружаю…</p>}
          {tickets !== null && shown.length === 0 && (
            <p className="dash__muted">
              {tickets.length === 0 ? "ядро не отдало ни одного тикета" : "под фильтры ничего не подошло"}
            </p>
          )}

          <ul className="dash__list">
            {shown.map((t) => (
              <TicketCard
                key={t.name}
                ticket={t}
                expanded={expanded === t.name}
                body={bodyOf(t.name)}
                loading={bodyLoading === t.name}
                error={expanded === t.name ? bodyError : null}
                onToggle={() => toggle(t.name)}
              />
            ))}
          </ul>
        </>
      ) : (
        <>
          {reviews === null && <p className="dash__muted">загружаю…</p>}
          {reviews !== null && reviews.length === 0 && (
            <p className="dash__muted">
              ревью пока не было — они появляются после хода с включённым авторевью
              (`review_min_turns` в настройках инстанса)
            </p>
          )}
          <ul className="dash__list">
            {(reviews ?? []).map((r) => (
              <ReviewCard key={r.id} review={r} onOpen={onOpenSession} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
