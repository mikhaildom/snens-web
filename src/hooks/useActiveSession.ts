import { useCallback, useEffect, useState } from "react";

/**
 * Сессия живёт в URL: `?session=<id>`. Это даёт рабочую навигацию браузера
 * вперёд/назад и ссылку на конкретную сессию.
 */
export function useActiveSession() {
  const [active, setActive] = useState<string | null>(
    () => new URLSearchParams(location.search).get("session"),
  );

  /**
   * Выбор сессии из списка: адрес обновляем через `replaceState`.
   *
   * `pushState` на каждый клик по списку забивал историю браузера — «назад»
   * приходилось щёлкать десятки раз. Одна запись на загрузку страницы: внутри
   * неё сессия переключается без роста истории, а «назад» возвращает туда, где
   * человек был до прихода в приложение.
   */
  const select = useCallback((id: string | null) => {
    setActive(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set("session", id);
    else url.searchParams.delete("session");
    if (decodeURIComponent(location.href) !== url.toString()) {
      history.replaceState({ session: id }, "", url);
    }
  }, []);

  /**
   * Углубиться в сессию (открыть подагента): `pushState`, в отличие от
   * `select`. Здесь рост истории — не шум, а нужное поведение: «назад»
   * возвращает ровно туда, откуда пришёл, а не в начало приложения.
   */
  const push = useCallback((id: string) => {
    setActive(id);
    const url = new URL(location.href);
    url.searchParams.set("session", id);
    history.pushState({ session: id }, "", url);
  }, []);

  /** Кнопка «назад» в интерфейсе: шаг по истории, а не свой стек. */
  const back = useCallback(() => {
    history.back();
  }, []);

  // Кнопки браузера: состояние забираем из адреса, а не из своего.
  useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(location.search).get("session");
      setActive(id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return { active, select, push, back };
}
