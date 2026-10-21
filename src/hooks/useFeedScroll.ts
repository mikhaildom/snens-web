import { useEffect, useRef } from "react";

/**
 * Автоскролл ленты: держимся низа только пока человек там же.
 *
 * Раньше эффект безусловно ставил `scrollTop = scrollHeight` на каждое
 * изменение `msgs`/`live`, то есть на каждую дельту стрима: прочитать более
 * раннее сообщение во время хода было невозможно — лента уезжала вниз.
 *
 * Правило: если до обновления лента стояла у низа (или почти у низа, запас
 * `STICK_PX`) — прокручиваем; если человек отлистал вверх — не трогаем и
 * показываем кнопку «вниз». Уход с низа запоминается в ref, чтобы решение
 * принималось по позиции ДО вставки новых блоков.
 */
const STICK_PX = 48;

export function useFeedScroll(deps: unknown[]) {
  const feedRef = useRef<HTMLDivElement>(null);
  /** Лента стоит у низа: обновление должно тянуть её дальше вниз. */
  const stick = useRef(true);
  /** Есть новое ниже: показываем кнопку «вниз». */
  const away = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const onScroll = () => {
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stick.current = bottom <= STICK_PX;
      // Кнопку дёргаем напрямую через DOM: лишний state на каждое событие
      // скролла — это ререндер всей ленты на каждое движение колеса.
      away.current = !stick.current && bottom > STICK_PX * 4;
      if (buttonRef.current) {
        buttonRef.current.dataset.show = String(away.current);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = feedRef.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const toBottom = () => {
    const el = feedRef.current;
    if (!el) return;
    stick.current = true;
    el.scrollTop = el.scrollHeight;
    if (buttonRef.current) buttonRef.current.dataset.show = "false";
  };

  return { feedRef, buttonRef, toBottom };
}
