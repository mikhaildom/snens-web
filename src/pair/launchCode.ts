/**
 * Код пейринга из адреса страницы: `http://127.0.0.1:7420/#pair=123-456`.
 *
 * Так его передаёт ярлык запуска (Windows 7, `start-snens.cmd`): он сам
 * поднимает ядро, берёт у него код (`snens pair`) и открывает браузер уже с
 * кодом — человеку не надо ничего переписывать из окна консоли. Код живёт
 * 5 минут и годится один раз, поэтому после чтения он убирается из адреса
 * (не остаётся в истории и закладках).
 *
 * Читается один раз на старте (`main.tsx`), до первого рендера: если браузер
 * уже подключён, экран пейринга не покажется, а код всё равно надо стереть.
 */
let taken: string | null | undefined;

export function takeLaunchCode(): string | null {
  if (taken !== undefined) return taken;
  taken = null;
  const m = /(?:^#|&)pair=([0-9][0-9-]{3,15})(?:&|$)/.exec(location.hash);
  if (m) {
    taken = m[1];
    history.replaceState(null, "", location.pathname + location.search);
  }
  return taken;
}

/**
 * Адрес ядра для кода из адреса страницы: код выдало ядро, которое отдаёт эту
 * страницу, значит и подключаться к нему же.
 */
export function launchBaseUrl(): string | null {
  return takeLaunchCode() && /^https?:$/.test(location.protocol) ? location.origin : null;
}

let used = false;

/**
 * Код для автоматического подключения — отдаётся один раз за загрузку
 * страницы: повторный показ экрана пейринга (например, после «отключиться»)
 * не должен снова слать уже погашенный код.
 */
export function takeLaunchOnce(): { baseUrl: string; code: string } | null {
  if (used) return null;
  const code = takeLaunchCode();
  const baseUrl = launchBaseUrl();
  if (!code || !baseUrl) return null;
  used = true;
  return { baseUrl, code };
}

/** Для тестов: забыть прочитанное. */
export function resetLaunchCode() {
  taken = undefined;
  used = false;
}
