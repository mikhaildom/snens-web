/**
 * Оболочка Tauri: переключение ядра и признак «я в окне приложения».
 *
 * Зачем отдельный модуль. Клиент живёт в двух мирах: в браузере (под vite или
 * на статике ядра) и в окне десктоп-приложения. Во втором у него есть команды
 * оболочки, которых в браузере нет, — переключить ядро на чужое (пейринг) или
 * вернуться к своему. Вызываются они через IPC Tauri, а не HTTP: это действия
 * над процессом оболочки, а не над данными ядра.
 *
 * Почему `__TAURI_INTERNALS__`, а не `@tauri-apps/api`: пакет тянет в бандл
 * лишний код и версию, которую надо держать в согласии с оболочкой, ради одного
 * `invoke`. Достаточно проверить наличие IPC и вызвать его напрямую.
 */

/** Что оболочка кладёт в окно помимо соединения. */
interface ShellFlags {
  /** Окно оболочки, а не вкладка браузера. */
  shell?: boolean;
  /** Окно подключено к чужому ядру — в настройках нужна кнопка «вернуться». */
  remote?: boolean;
}

type Internals = {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

function internals(): Internals | null {
  const w = globalThis as { __TAURI_INTERNALS__?: Internals };
  return w.__TAURI_INTERNALS__ ?? null;
}

/** Окно десктоп-приложения (в браузере — false). */
export function inShell(): boolean {
  const w = globalThis as { __SNENS__?: ShellFlags };
  return Boolean(w.__SNENS__?.shell) && internals()?.invoke != null;
}

/** Окно работает с чужим ядром (пейринг), а не со своим процессом. */
export function isRemote(): boolean {
  const w = globalThis as { __SNENS__?: ShellFlags };
  return Boolean(w.__SNENS__?.remote);
}

/**
 * Подключить окно к чужому ядру. Оболочка запомнит адрес и токен и при
 * следующем запуске своё ядро не поднимет.
 *
 * Возвращает текст ошибки или `null`. Не бросает: вызывающий — форма, у которой
 * каждая ветка кончается сообщением человеку.
 */
export async function pairShell(baseUrl: string, token: string): Promise<string | null> {
  const ipc = internals();
  if (!ipc?.invoke) return "это не окно приложения: подключение через оболочку недоступно";
  try {
    await ipc.invoke("set_remote", { baseUrl, token });
    return null;
  } catch (e) {
    return String(e);
  }
}

/** Вернуться к своему ядру. Действует со следующего запуска окна. */
export async function forgetShellRemote(): Promise<string | null> {
  const ipc = internals();
  if (!ipc?.invoke) return "это не окно приложения";
  try {
    await ipc.invoke("clear_remote");
    return null;
  } catch (e) {
    return String(e);
  }
}

/**
 * Пересоздать окно на текущем соединении.
 *
 * Нужно после смены соединения: адрес и токен оболочка инжектит в окно при его
 * создании, поэтому `location.reload()` оставил бы клиент на старом адресе.
 * Оболочка уничтожает окно и строит новое с новым инжектом.
 */
export async function reloadShell(): Promise<string | null> {
  const ipc = internals();
  if (!ipc?.invoke) return "это не окно приложения";
  try {
    await ipc.invoke("reopen");
    return null;
  } catch (e) {
    return String(e);
  }
}
