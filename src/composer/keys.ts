/**
 * Клавиатурные правила composer'а — чистой функцией, чтобы проверять тестом.
 *
 * Enter отправляет сообщение только там, где есть физическая клавиатура.
 * На тач-экране Enter — это «перенос строки»: на виртуальной клавиатуре
 * Gboard/SwiftKey/клавиатура iOS он рядом с пробелом, и человек, набирающий
 * абзац, отправлял недописанное сообщение (владелец поймал живьём). Отправка
 * на мобиле остаётся кнопкой — она крупная и на виду.
 *
 * `isComposing` — IME: во время набора иероглифов/акцентов Enter подтверждает
 * композицию, а не отправляет. Без этой проверки китайская/японская раскладка
 * отправляет сообщение на середине слова.
 */

/** Тач-экран с виртуальной клавиатурой. */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  // `any-pointer` — периферия важнее: планшет с подключённой мышью остаётся
  // тачем по классификации, и это правильно — печатают всё равно экраном.
  return window.matchMedia("(any-pointer: coarse)").matches;
}

/**
 * Нужно ли отправить сообщение по этому Enter.
 *
 * `coarse` передаётся снаружи: тест не может поднять настоящий matchMedia, а
 * подменять глобальный `window` ради одного правила — дороже, чем аргумент.
 */
export function enterSends(
  e: { key: string; shiftKey: boolean; isComposing?: boolean },
  coarse: boolean,
): boolean {
  if (e.key !== "Enter" || e.shiftKey) return false;
  if (e.isComposing) return false;
  return !coarse;
}

/** Подсказка в title поля: на мобиле про Enter врать нельзя. */
export function composerHint(coarse: boolean): string {
  return coarse
    ? "enter — перенос строки · отправить — кнопкой · файлы — кнопкой + или drag&drop"
    : "enter — отправить · shift+enter — перенос · файлы — кнопкой + или drag&drop";
}
