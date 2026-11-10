import type { TranscriptMessage } from "../api";

/**
 * Ответ человека на вопрос из артефакта (`snens.ask`).
 *
 * Это не реплика человека в обычном смысле: он не писал текст, а ткнул вариант
 * в интерфейсе, который нарисовала модель. Поэтому — серая тонкая строка с
 * раскрытием: снаружи видно, что ответ был и на что, внутри — то, что реально
 * уехало модели. Показывать это полноценной репликой значило бы засорять
 * историю машиной разметкой и путать её с голосом человека.
 *
 * `m.content` у такой записи — уже собранный текст для модели
 * (`[ответ на артефакт «…»] 2`); здесь разворачиваем ссылку для человека.
 */
export function AnswerMark({ m }: { m: TranscriptMessage }) {
  const ask = m.ask;
  const text = (m.content ?? "").replace(/^\[ответ на артефакт[^\]]*\]\s*/, "").trim();
  const oneLine = text.replace(/\s+/g, " ").slice(0, 90);
  return (
    <details className="answer">
      <summary>
        <span className="answer__mark">↩</span>
        <span className="answer__name">Ответ{ask?.id ? `: ${ask.id}` : ""}</span>
        <span className="answer__peek">{oneLine}</span>
      </summary>
      <div className="answer__body">
        <div className="answer__row">
          <span>Артефакт</span>
          <span>{ask?.artifact ?? "—"}</span>
        </div>
        {ask?.question && (
          <div className="answer__row">
            <span>Вопрос</span>
            <span>{ask.question}</span>
          </div>
        )}
        <pre className="code">{text}</pre>
        <p className="answer__hint">Этот текст ушёл модели как реплика человека</p>
      </div>
    </details>
  );
}
