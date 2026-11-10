import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { autosize, maxHeightFor } from "./autosize";
import { composerHint, enterSends, isCoarsePointer } from "./keys";
import { Icon, StopIcon } from "../ui/icons";
import { useBlockCursor } from "./useBlockCursor";

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
  bar,
}: {
  /** Нижний ряд: модель, подагенты, контекст, стоп. */
  bar: ComposerBar;
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
  const { mirRef, curRef, place } = useBlockCursor(area);

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

  // Печать «в никуда» уходит в поле: если ни одно поле ввода не выбрано и
  // нажата буква, фокус переезжает сюда до того, как браузер вставит символ,
  // и буква попадает в текст. Сочетания с Cmd/Ctrl/Alt не трогаем, скрытое
  // поле (открыты тикеты или настройки) тоже.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (e.key.length !== 1) return;
      const el = area.current;
      if (!el || el.offsetParent === null || el.disabled) return;
      const t = document.activeElement as HTMLElement | null;
      if (t && t !== document.body && t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], iframe")) return;
      el.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
  useLayoutEffect(() => {
    fit();
    place();
  }, [draft, fit, place]);

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

  const sendLabel = bar.running && bar.canStop ? "Остановить" : "Отправить";
  return (
    <div
      className="composer-wrap"
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
              <button className="ibtn" aria-label="Убрать файл" onClick={() => onDetach(p.id)}>
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Клик по пустому месту рамки ставит курсор в текст: всё поле — одна цель. */}
      <div
        className="composer"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button,textarea,input")) return;
          e.preventDefault();
          area.current?.focus();
        }}
      >
        <textarea
          ref={area}
          value={draft}
          rows={1}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          lang="ru"
          placeholder="Напиши задачу обычными словами"
          title={composerHint(coarse)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyUp={place}
          onClick={place}
          onSelect={place}
          onFocus={place}
          onBlur={place}
          onScroll={place}
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
        <div className="ta-mir" ref={mirRef} aria-hidden="true" />
        <span className="tcur" ref={curRef} aria-hidden="true" />
        <div className="cmp-row">
          <button className="ibtn mob-only" onClick={bar.onBurger} aria-label="Сессии">
            <Icon name="burger" />
          </button>
          <button className="ibtn" title="Прикрепить файл" aria-label="Прикрепить файл" onClick={() => fileInput.current?.click()}>
            <Icon name="attach" />
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
          <button className="chip" onClick={bar.onModel} title={bar.model || "Модель"}>
            <span className="trunc">{shortModel(bar.model)}</span>
          </button>
          <span className="grow" />
          <button className="chip" onClick={bar.onAgents} aria-label="Подагенты и тулы" title="Подагенты и тулы">
            <Icon name="agents" />
            <span>{bar.agents}</span>
          </button>
          {bar.ctxPct != null && (
            <button className="chip" onClick={bar.onCtx} aria-label={`Контекст: ${bar.ctxTitle}`} title={`Контекст: ${bar.ctxTitle}`}>
              <span className="gauge" aria-hidden="true">
                <i style={{ width: `${bar.ctxPct}%` }} />
              </span>
              <span>{Math.round(bar.ctxPct)}%</span>
            </button>
          )}
          <button
            className="send"
            data-off={!bar.running && !canSend}
            onClick={() => (bar.running && bar.canStop ? bar.onStop() : void submit())}
            aria-label={sendLabel}
            title={sendLabel}
          >
            {bar.running && bar.canStop ? <StopIcon /> : <Icon name="send" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ComposerBar {
  model: string;
  onModel: () => void;
  agents: number;
  onAgents: () => void;
  ctxPct: number | null;
  ctxTitle: string;
  onCtx: () => void;
  running: boolean;
  canStop: boolean;
  onStop: () => void;
  onBurger: () => void;
}

/** «vendor/model-name-1017» → «model-name-1017»: полное имя — в подсказке. */
function shortModel(m: string): string {
  return m ? (m.split("/").pop() ?? m).replace(/^deepseek-/, "") : "Модель";
}
