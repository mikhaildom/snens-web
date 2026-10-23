import { Markdown } from "../markdown";
import { relTime } from "../lib/time";
import { isOpen, weightNum, type Ticket } from "./filters";

/**
 * Карточка тикета: заголовок, бейджи, симптом. Тело грузится лениво — только
 * при раскрытии, и только один раз на тикет (`body` приходит из `Dashboard`,
 * который держит кеш): список открывается мгновенно независимо от размера
 * текстов тикетов.
 */
export function TicketCard({
  ticket,
  expanded,
  body,
  loading,
  error,
  onToggle,
}: {
  ticket: Ticket;
  expanded: boolean;
  body: string | null;
  loading: boolean;
  error: string | null;
  onToggle: () => void;
}) {
  const open = isOpen(ticket.status);
  return (
    <li className="dash__card" data-expanded={expanded} data-open={open}>
      {/* Кнопка-заголовок: клик раскрывает карточку и работает с клавиатуры
          без своих обработчиков клавиш. */}
      <button className="dash__card-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="dash__card-name">{ticket.name}</span>
        <span className="dash__badges">
          <span className="dash__badge" data-tone={open ? "open" : "closed"}>
            {ticket.status}
          </span>
          {ticket.kind && <span className="dash__badge">{ticket.kind}</span>}
          <span className="dash__badge" title="сколько раз повторялось">
            hits {ticket.hits}
          </span>
          <span className="dash__badge" title="вес: насколько мешает">
            w {weightNum(ticket.weight) || ticket.weight || "—"}
          </span>
          {ticket.target && <span className="dash__badge dash__badge--target">{ticket.target}</span>}
        </span>
        <span className="dash__card-time">{relTime(ticket.mtime)}</span>
      </button>

      {ticket.symptom && <p className="dash__card-symptom">{ticket.symptom}</p>}

      {expanded && (
        <div className="dash__card-body">
          {loading && <p className="dash__muted">загружаю…</p>}
          {error && <p className="dash__error">{error}</p>}
          {body && <Markdown text={body} images={false} />}
        </div>
      )}
    </li>
  );
}
