import { useEffect, useMemo, useRef, useState } from "react";
import { api, type SessionInfo, type TranscriptMessage } from "../api";
import { Markdown } from "../markdown";
import { buildBlocks, collectTools } from "../lenta";
import { Feed } from "../feed/Feed";
import { relTime } from "../lib/time";
import { Icon } from "../ui/icons";
import { isOpen, type Review, type Ticket } from "./filters";

export type DashTab = "tickets" | "reviews";

const KIND: Record<string, string> = {
  defect: "дефект",
  opportunity: "возможность",
  harness: "харнес",
  workflow: "процесс",
};
const STATUS: Record<string, string> = {
  open: "Открыт",
  doing: "В работе",
  done: "Готов",
  wontfix: "Не будем",
  closed: "Закрыт",
  resolved: "Решён",
};
const REVIEW: Record<Review["status"], string> = {
  ok: "Готово",
  error: "Ошибка",
  running: "Идёт или прервано",
};

/** Тело тикета без front-matter: поля шапки и так показаны строкой меты. */
function stripFront(body: string): string {
  return body.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

/** Заголовок `# …` в начале тела: им называем тикет, если нет симптома. */
function splitHeading(body: string): { heading: string; rest: string } {
  const m = body.match(/^#\s+(.+)\n?/);
  return m ? { heading: m[1].trim(), rest: body.slice(m[0].length).trim() } : { heading: "", rest: body };
}

function param(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}
function setParam(name: string, value: string | null) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  history.replaceState(history.state, "", url);
}

/**
 * Тикеты и ревью: вкладка вместо чата. Слева одна полоса вкладок и список
 * (тикеты группами «Открытые» и «Закрытые»), справа чтение выбранного: тело
 * тикета целиком или полный журнал ревью — тем же видом, что и лента чата.
 * Выбор живёт в адресе (`dashTab`, `t`, `r`), ссылка открывает тот же вид.
 */
export function Dashboard({
  onClose,
  onOpenSession,
  onError,
  sessions,
}: {
  onClose: () => void;
  /** Переход в сессию — тем же путём, что карточки подагентов (`push`). */
  onOpenSession: (session: string) => void;
  onError: (e: string) => void;
  sessions: SessionInfo[];
}) {
  const [tab, setTab] = useState<DashTab>(() => (param("dashTab") === "reviews" ? "reviews" : "tickets"));
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [query, setQuery] = useState("");
  const [tSel, setTSel] = useState<string | null>(() => param("t"));
  const [rSel, setRSel] = useState<string | null>(() => param("r"));
  /** На телефоне список и чтение по очереди: выбор переключает на чтение. */
  const [reading, setReading] = useState(false);
  const bodies = useRef(new Map<string, string>());
  const [body, setBody] = useState<{ name: string; text: string | null; error: string | null } | null>(null);
  const [log, setLog] = useState<{ id: string; msgs: TranscriptMessage[] | null; error: string | null } | null>(null);

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

  const title = (id: string) => sessions.find((s) => s.id === id)?.title || id.slice(0, 8);
  const q = query.trim().toLowerCase();
  const shownTickets = useMemo(
    () =>
      (tickets ?? []).filter(
        (t) => !q || t.name.toLowerCase().includes(q) || t.symptom.toLowerCase().includes(q) || t.target.toLowerCase().includes(q),
      ),
    [tickets, q],
  );
  const shownReviews = useMemo(
    () =>
      (reviews ?? []).filter(
        (r) => !q || r.summary.toLowerCase().includes(q) || title(r.session).toLowerCase().includes(q),
      ),
    // title зависит от sessions
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviews, q, sessions],
  );

  const ticket = shownTickets.find((t) => t.name === tSel) ?? shownTickets[0] ?? null;
  const review = shownReviews.find((r) => r.id === rSel) ?? shownReviews[0] ?? null;

  // Тело тикета: лениво и один раз на имя.
  useEffect(() => {
    if (tab !== "tickets" || !ticket) return;
    const name = ticket.name;
    const cached = bodies.current.get(name);
    if (cached != null) {
      setBody({ name, text: cached, error: null });
      return;
    }
    setBody({ name, text: null, error: null });
    let alive = true;
    api
      .ticket(name)
      .then((b) => {
        bodies.current.set(name, b.body);
        if (alive) setBody({ name, text: b.body, error: null });
      })
      .catch((e) => alive && setBody({ name, text: null, error: String(e instanceof Error ? e.message : e) }));
    return () => {
      alive = false;
    };
  }, [tab, ticket?.name]);

  // Журнал ревью — это обычная сессия `<id>-review`: читаем её историю.
  useEffect(() => {
    if (tab !== "reviews" || !review) return;
    const id = review.id;
    setLog({ id, msgs: null, error: null });
    let alive = true;
    api
      .history(id, false)
      .then((h) => alive && setLog({ id, msgs: h.messages, error: null }))
      .catch((e) => alive && setLog({ id, msgs: null, error: String(e instanceof Error ? e.message : e) }));
    return () => {
      alive = false;
    };
  }, [tab, review?.id]);

  const logBlocks = useMemo(() => {
    if (!log?.msgs) return [];
    return buildBlocks(log.msgs, collectTools(log.msgs, [], true));
  }, [log]);

  const parsed = body && ticket && body.name === ticket.name && body.text != null ? splitHeading(stripFront(body.text)) : null;

  const pickTab = (t: DashTab) => {
    setTab(t);
    setReading(false);
    setParam("dashTab", t === "reviews" ? "reviews" : null);
  };
  const pickTicket = (name: string) => {
    setTSel(name);
    setReading(true);
    setParam("t", name);
  };
  const pickReview = (id: string) => {
    setRSel(id);
    setReading(true);
    setParam("r", id);
  };

  const open = shownTickets.filter((t) => isOpen(t.status));
  const closed = shownTickets.filter((t) => !isOpen(t.status));
  const ticketRow = (t: Ticket) => (
    <button key={t.name} className="tr" data-on={ticket?.name === t.name} onClick={() => pickTicket(t.name)}>
      <span className="mk" data-s={isOpen(t.status) ? "open" : "closed"} aria-hidden="true" />
      <span className="tr-t">{t.symptom || t.name}</span>
      <span className="tr-m">
        {[t.status !== "open" && isOpen(t.status) ? (STATUS[t.status] ?? t.status).toLowerCase() : "", KIND[t.kind] ?? t.kind, t.target, relTime(t.mtime)]
          .filter(Boolean)
          .join(", ")}
      </span>
    </button>
  );

  return (
    <div className="tix" data-reading={reading}>
      <div className="tix-l">
        <div className="tix-tabs" role="tablist" aria-label="Тикеты и ревью">
          <button role="tab" aria-selected={tab === "tickets"} onClick={() => pickTab("tickets")}>
            Тикеты <b>{tickets?.length ?? ""}</b>
          </button>
          <button role="tab" aria-selected={tab === "reviews"} onClick={() => pickTab("reviews")}>
            Ревью <b>{reviews?.length ?? ""}</b>
          </button>
          <button className="ibtn" onClick={onClose} aria-label="Закрыть тикеты" title="Закрыть: esc">
            <Icon name="close" />
          </button>
        </div>
        <label className="rsearch tix-search">
          <Icon name="search" />
          <input
            value={query}
            placeholder={tab === "tickets" ? "Поиск по тикетам" : "Поиск по ревью"}
            aria-label="Поиск"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
          />
        </label>
        <div className="tix-list">
          {tab === "tickets" ? (
            tickets === null ? (
              <div className="rail-empty">Загружаю…</div>
            ) : shownTickets.length === 0 ? (
              <div className="rail-empty">{tickets.length ? "Ничего не нашлось" : "Тикетов пока нет"}</div>
            ) : (
              <>
                {open.length > 0 && <div className="rail-date">Открытые</div>}
                {open.map(ticketRow)}
                {closed.length > 0 && <div className="rail-date">Закрытые</div>}
                {closed.map(ticketRow)}
              </>
            )
          ) : reviews === null ? (
            <div className="rail-empty">Загружаю…</div>
          ) : shownReviews.length === 0 ? (
            <div className="rail-empty">
              {reviews.length ? "Ничего не нашлось" : "Ревью пока не было. Оно запускается само после длинной сессии и простоя."}
            </div>
          ) : (
            shownReviews.map((r) => (
              <button key={r.id} className="tr" data-on={review?.id === r.id} onClick={() => pickReview(r.id)}>
                <span className="mk" data-s={r.status} aria-hidden="true" />
                <span className="tr-t">{title(r.session)}</span>
                <span className="tr-m">
                  {relTime(r.ts)}, {REVIEW[r.status].toLowerCase()}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="tix-r">
        <button className="gbtn mob-only tix-back" onClick={() => setReading(false)}>
          <Icon name="back" />К списку
        </button>
        {tab === "tickets" && ticket && (
          <article className="tix-in">
            <h2>{ticket.symptom || parsed?.heading || ticket.name}</h2>
            <div className="tix-meta">
              <b>{STATUS[ticket.status] ?? (ticket.status || "Без статуса")}</b>
              {ticket.kind && <span>{KIND[ticket.kind] ?? ticket.kind}</span>}
              {ticket.target && <span>цель: {ticket.target}</span>}
              {ticket.weight && <span>вес: {ticket.weight}</span>}
              <span>повторов: {ticket.hits}</span>
              <span>{relTime(ticket.mtime)}</span>
            </div>
            {ticket.family && <p className="tix-family">{ticket.family}</p>}
            {body?.name === ticket.name && body.text == null && !body.error && <p className="dash-muted">Загружаю…</p>}
            {body?.name === ticket.name && body.error && <p className="dash-err">{body.error}</p>}
            {body?.name === ticket.name && body.text != null && (
              <div className="tix-body">
                <Markdown text={ticket.symptom ? stripFront(body.text) : (parsed?.rest ?? "")} images={false} />
              </div>
            )}
            <div className="tix-meta">
              <span>tickets/{ticket.name}.md</span>
            </div>
          </article>
        )}
        {tab === "reviews" && review && (
          <article className="tix-in">
            <h2>{title(review.session)}</h2>
            <div className="tix-meta">
              <b>{REVIEW[review.status]}</b>
              <span>{relTime(review.ts)}</span>
              <span>{review.id}</span>
            </div>
            <div className="tix-acts">
              <button className="gbtn" onClick={() => onOpenSession(review.session)}>
                Исходная сессия
              </button>
              <button className="gbtn" onClick={() => onOpenSession(review.id)}>
                Открыть журнал как сессию
              </button>
            </div>
            {log?.id === review.id && log.msgs == null && !log.error && <p className="dash-muted">Загружаю журнал…</p>}
            {log?.id === review.id && log.error && (
              <>
                <p className="dash-err">Журнал не прочитался: {log.error}</p>
                {review.summary && (
                  <div className="tix-body">
                    <Markdown text={review.summary} images={false} />
                  </div>
                )}
              </>
            )}
            {log?.id === review.id && log.msgs && (
              <div className="jr col">
                <Feed
                  session={review.id}
                  blocks={logBlocks}
                  live={[]}
                  approval={null}
                  onDecide={() => {}}
                  error={null}
                  onDismissError={() => {}}
                />
              </div>
            )}
            {review.status === "running" && (
              <p className="dash-muted">Записи о завершении нет: ревью ещё идёт или его процесс завершён. По журналу это не различить.</p>
            )}
          </article>
        )}
        {((tab === "tickets" && !ticket && shownTickets.length > 0) || (tab === "reviews" && !review && shownReviews.length > 0)) && (
          <p className="dash-muted">Выбери запись слева.</p>
        )}
      </div>
    </div>
  );
}
