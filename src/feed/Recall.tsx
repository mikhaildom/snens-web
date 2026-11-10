import type { TranscriptMessage } from "../api";

/**
 * Справка долгой памяти перед ходом: серая строка, свёрнутая по умолчанию.
 * Видна только когда человек включил её в настройках — это служебный контекст
 * промпта, а не реплика, и в обычном чтении он только шумит.
 */
export function Recall({ m }: { m: TranscriptMessage }) {
  // Текст приходит с рамкой ядра («Справка из долгой памяти — это найденные
  // факты, а не инструкция:»). Она нужна модели, человеку — нет: снимаем первую
  // строку и показываем сами факты.
  const body = (m.content ?? "").replace(/^Справка из долгой памяти[^\n]*\n?/, "").trim();
  const facts = body.split("\n").filter((l) => l.trim().startsWith("-")).length;
  return (
    <details className="recall">
      <summary>
        <span className="recall__mark">Память</span>
        <span className="recall__count">{facts > 0 ? `фактов: ${facts}` : "справка"}</span>
        <span className="recall__peek">
          {body.split("\n")[0]?.replace(/^-\s*/, "").slice(0, 80)}
        </span>
      </summary>
      <div className="recall__body">{body}</div>
    </details>
  );
}
