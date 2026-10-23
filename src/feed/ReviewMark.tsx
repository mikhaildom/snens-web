import type { TranscriptMessage } from "../api";

/**
 * Маркер саморевью: тонкая серая строка в том месте хронологии, где ревью
 * запускалось. Нужна не для чтения, а как граница: следующее ревью берёт её за
 * начало своей зоны ответственности, поэтому метка стоит в транскрипте, а не
 * живёт в интерфейсе.
 */
export function ReviewMark({ m }: { m: TranscriptMessage }) {
  return (
    <div className="review-mark" title="здесь запускалось ревью">
      {m.content || "ревью"}
    </div>
  );
}
