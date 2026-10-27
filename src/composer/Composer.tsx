import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { autosize, maxHeightFor } from "./autosize";
import { composerHint, enterSends, isCoarsePointer } from "./keys";

export type PendingFile = { file: File; id: string };

/**
 * Высота комфортной одной строки. Держим в JS, а не читаем из CSS: расчёт
 * высоты — чистая функция (`autosize.ts`), и её нижняя граница должна быть тем
 * же числом, что и `min-height` в стилях. Расхождение ловится тестом.
 */
const LINE_HEIGHT = 44;

/**
 * Composer: поле ввода, вложения под ним, drag&drop.
 *
 * Черновик живёт ЗДЕСЬ, а не в `App`. Это не косметика: пока `draft` был
 * состоянием `App`, каждая буква перерисовывала всё дерево — ленту на 2500
 * записей, рельсу, док с раскладом контекста. На длинной сессии ввод отставал
 * от нажатий на десятки-сотни миллисекунд (владелец поймал живьём). Наружу
 * уходит только готовый текст: `onSend(text)` возвращает `true`, если его
 * приняли, — тогда поле очищается. Не приняли (ошибка отправки) — текст
 * остаётся на месте, иначе человек теряет написанное.
 *
 * Поле растёт по содержимому (`autosize.ts`) и упирается в долю высоты окна;
 * дальше внутри появляется скролл. Высоту пересчитываем на трёх событиях:
 * правка, изменение размера окна и — важно — программная очистка после
 * отправки. Без последнего поле оставалось высоким на пустом черновике: React
 * менял значение, а высоту никто не переставлял.
 */
export function Composer({
  pending,
  onAttach,
  onDetach,
  onSend,
  hidden = false,
  resetKey,
}: {
  /** Спрятать вместе с лентой, когда открыта другая страница (дашборд). */
  hidden?: boolean;
  /**
   * Внешний повод очистить поле: новая сессия, выбор другой сессии. Меняется —
   * черновик стирается. Число/строка, а не колбэк: сравнение по значению.
   */
  resetKey?: unknown;
  /** Отправить. `true` — принято, поле можно очищать. */
  onSend: (text: string) => Promise<boolean>;
  pending: PendingFile[];
  onAttach: (files: FileList | null) => void;
  onDetach: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // Тач-экран: Enter — перенос строки, отправка кнопкой (правило в `keys.ts`).
  // Инстанс может переехать с телефона на десктоп в той же вкладке (поворот,
  // отключённая мышь), поэтому не только начальное значение, но и подписка.
  const [coarse, setCoarse] = useState(isCoarsePointer);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(any-pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Смена сессии/новый чат — поле чистое. `useEffect`, а не внутри `onChange`:
  // поводов много (выбор в рельсе, кнопка «+», возврат из дашборда), и
  // дублировать вызов в каждом — гарантированно где-то забыть.
  useEffect(() => {
    setDraft("");
  }, [resetKey]);

  /**
   * Пересчёт высоты. `height: auto` перед чтением `scrollHeight` обязателен:
   * при явно заданной высоте браузер отдаёт высоту бокса, а не содержимого, и
   * поле умело только расти — обратно не сжималось.
   */
  const fit = useCallback(() => {
    const el = area.current;
    if (!el) return;
    const max = maxHeightFor(window.innerHeight);
    el.style.height = "auto";
    el.style.height = `${autosize(el.scrollHeight, max, LINE_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, []);

  // После каждой правки и после программной очистки: значение уже в DOM,
  // поэтому useLayoutEffect — иначе на кадр видно прыжок высоты.
  useLayoutEffect(fit, [draft, fit]);

  // Изменение ширины меняет перенос строк, а значит и `scrollHeight`.
  // ResizeObserver на самом поле ловит и ресайз окна, и смену ширины рельсы
  // тягой — слушатель `resize` второго случая не видит. Наблюдаем `document`
  // (поле само растёт от нас — на себя смотреть нельзя, будет цикл).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [fit]);

  /** Есть что отправлять: текст или хотя бы один файл. */
  const canSend = draft.trim().length > 0 || pending.length > 0;

  /**
   * Отправка. Очищаем поле только если внешний обработчик подтвердил, что
   * текст принят: при ошибке сети человек не должен терять написанное.
   */
  async function submit() {
    if (!canSend) return;
    const text = draft;
    const ok = await onSend(text);
    if (ok) setDraft("");
  }

  return (
    <div
      className="composer"
      hidden={hidden}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.dataset.drag = "true";
      }}
      onDragLeave={(e) => {
        delete e.currentTarget.dataset.drag;
      }}
      onDrop={(e) => {
        e.preventDefault();
        delete e.currentTarget.dataset.drag;
        onAttach(e.dataTransfer.files);
      }}
    >
      {pending.length > 0 && (
        <ul className="composer__files">
          {pending.map((p) => (
            <li key={p.id}>
              <span>{p.file.name}</span>
              <span className="composer__size">{(p.file.size / 1024).toFixed(0)} КБ</span>
              <button className="ghost" aria-label="убрать" onClick={() => onDetach(p.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Единая рамка бокса: кнопки внутри, а не снаружи — иначе три отдельных
          прямоугольника читались как три разных инструмента. */}
      <div className="composer__box">
        <button
          className="composer__attach"
          title="прикрепить файл"
          onClick={() => fileInput.current?.click()}
        >
          +
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onAttach(e.target.files);
            e.target.value = "";
          }}
        />
        {/* spellCheck выключен осознанно: браузер проверяет поле по языку
            страницы, а мы пишем смесью русского и английского — половина
            слов светилась как опечатка. Тот же эффект у autoCorrect на мобильных. */}
        <textarea
          ref={area}
          value={draft}
          rows={1}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          lang="ru"
          placeholder="задача…"
          title={composerHint(coarse)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // `isComposing` и keyCode 229 — IME: Enter подтверждает композицию,
            // и отправлять сообщение на середине слова нельзя.
            const composing = e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
            if (enterSends({ key: e.key, shiftKey: e.shiftKey, isComposing: composing }, coarse)) {
              e.preventDefault();
              if (canSend) void submit();
            }
          }}
        />
        {/* disabled, но не спрятан: кнопка на месте, чтобы раскладка не
            прыгала, а неактивность читалась сразу. */}
        <button className="solid composer__send" onClick={() => void submit()} disabled={!canSend}>
          отправить
        </button>
      </div>
    </div>
  );
}
