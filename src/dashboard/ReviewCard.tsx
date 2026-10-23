import { relTime, time } from "../lib/time";
import type { Review } from "./filters";

/**
 * Карточка ревью: кто, когда, чем кончилось. Клик ведёт в сессию — через тот
 * же механизм, что карточки подагентов (`openChild` в App): история браузера
 * растёт на один шаг, и «назад» возвращает в дашборд, а не в начало.
 */
export function ReviewCard({ review, onOpen }: { review: Review; onOpen: (session: string) => void }) {
  return (
    <li className="dash__card dash__card--review" data-status={review.status}>
      <button
        className="dash__card-head"
        onClick={() => onOpen(review.session)}
        title={`открыть сессию ${review.session}`}
      >
        <span className="dash__card-name">{review.session}</span>
        <span className="dash__badges">
          <span className="dash__badge" data-tone={review.status}>
            {review.status === "ok" ? "ok" : review.status === "error" ? "ошибка" : "идёт"}
          </span>
        </span>
        <span className="dash__card-time" title={time(review.ts)}>
          {relTime(review.ts)}
        </span>
      </button>
      {review.summary && <p className="dash__card-symptom">{review.summary}</p>}
    </li>
  );
}
