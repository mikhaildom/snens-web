/**
 * Слой соединения: откуда клиент берёт адрес ядра и токен.
 *
 * До появления этого модуля адреса не было вовсе: клиент ходил на относительный
 * `/api`, а токен подставлял dev-сервер (`vite.config.ts`). Для браузера на том
 * же хосте это лучший вариант — секрет не попадает в бандл. Но упакованному
 * десктопу и подключению к чужому ядру нужен прямой адрес, и решать это должен
 * один слой, а не каждый вызов.
 *
 * Три источника по приоритету:
 *  1. `window.__SNENS__ = {baseUrl, token}` — инжектит оболочка (Tauri). Она
 *     знает адрес и хранит токен в своём защищённом хранилище, браузеру его
 *     знать не обязательно. Перебивает всё: оболочка — хозяин окна.
 *  2. `localStorage["snens-connection"]` — человек подключился через экран
 *     пейринга в обычном браузере. Токен устройства можно отозвать поштучно
 *     (`DELETE /v1/clients/{id}`), поэтому он и лежит рядом с адресом.
 *  3. Ничего → режим proxy: относительный `/api`, без заголовка. Поведение
 *     dev-стенда и прод-веба (они оба живут под `vite`, см. `vite.config.ts`).
 *
 * Модуль чистый (никакого React и `import.meta.env`): правила проверяются
 * `connection.test.ts` под `node --test`, как остальная логика в `lib/`.
 */

/** Прямое подключение: адрес ядра без хвостового слэша и токен (может быть пуст). */
export interface Connection {
  baseUrl: string;
  token: string;
}

/** Откуда взялось соединение. `proxy` — соединения нет, ходим на относительный `/api`. */
export type ConnectionSource = "injected" | "stored" | "proxy";

export interface Resolved {
  source: ConnectionSource;
  /** `null` — режим proxy. */
  conn: Connection | null;
}

/** Ключ в localStorage. Имя с префиксом, чтобы не пересечься с `snens-settings`. */
export const STORAGE_KEY = "snens-connection";

/** Что кладут в окно оболочки: поля необязательные — битое не должно ронять клиент. */
export interface InjectedConnection {
  baseUrl?: unknown;
  token?: unknown;
}

/** localStorage в node (тесты) отсутствует — обращаемся через проверку типа. */
function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // приватный режим/запрет cookie: доступ к localStorage бросает исключение
    return null;
  }
}

/**
 * Адрес из человеческого ввода: «127.0.0.1:7461» — это тоже адрес.
 *
 * Схема по умолчанию http, а не https: основной путь пейринга — приватная сеть
 * (tailnet/WireGuard), где ядро отдаёт открытый HTTP, и требовать https значило
 * бы заставлять человека писать его руками. Путь у адреса допустим (обратный
 * прокси со своим префиксом), хвостовой слэш — нет: склеиваем с `/v1/...`.
 */
export function normalizeBaseUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${path}`;
}

/**
 * Соединение из произвольного объекта (инжект оболочки, JSON из localStorage).
 *
 * Без адреса прямое подключение бессмысленно — возвращаем `null`, и клиент
 * откатывается на proxy. Пустой токен допускаем: адрес может стоять за
 * обратным прокси со своей аутентификацией, и тогда `Authorization` не шлём.
 */
export function parseConnection(v: unknown): Connection | null {
  if (!v || typeof v !== "object") return null;
  const o = v as InjectedConnection;
  const base = typeof o.baseUrl === "string" ? normalizeBaseUrl(o.baseUrl) : null;
  if (!base) return null;
  const token = typeof o.token === "string" ? o.token.trim() : "";
  return { baseUrl: base, token };
}

/** Прочитать сохранённое пейрингом соединение. Битый JSON — «не подключено». */
export function readStored(
  storage: Pick<Storage, "getItem"> | null = safeStorage(),
): Connection | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseConnection(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Правило приоритета источников — единственное место, где оно записано.
 * `injected` и `storage` передаются аргументами: тест проверяет правило, а не
 * глобальное состояние браузера.
 */
export function resolveConnection(opts: {
  injected?: unknown;
  storage?: Pick<Storage, "getItem"> | null;
}): Resolved {
  const injected = parseConnection(opts.injected);
  if (injected) return { source: "injected", conn: injected };
  const stored = readStored(opts.storage ?? null);
  if (stored) return { source: "stored", conn: stored };
  return { source: "proxy", conn: null };
}

/**
 * Соединение текущей страницы. Считается один раз: адрес ядра не меняется под
 * работающим приложением (после пейринга страница перезагружается) — а если бы
 * он менялся на ходу, половина запросов ушла бы на старый ядро.
 */
let cached: Resolved | null = null;

export function connection(): Resolved {
  if (!cached) {
    const w = globalThis as { __SNENS__?: InjectedConnection };
    cached = resolveConnection({ injected: w.__SNENS__, storage: safeStorage() });
  }
  return cached;
}

/** Запомнить соединение после пейринга. */
export function saveConnection(conn: Connection): void {
  const s = safeStorage();
  if (!s) return;
  s.setItem(STORAGE_KEY, JSON.stringify(conn));
  cached = null;
}

/** Отключиться: забыть адрес и токен устройства (сам токен на ядре остаётся). */
export function clearConnection(): void {
  const s = safeStorage();
  s?.removeItem(STORAGE_KEY);
  cached = null;
}

/**
 * URL запроса: абсолютный при прямом подключении, относительный `/api` при
 * прокси. `path` — всегда с `/v1/...`, префикс добавляет эта функция.
 */
export function apiUrl(path: string, conn: Connection | null): string {
  return conn ? `${conn.baseUrl}${path}` : `/api${path}`;
}

/** Заголовки авторизации: пусто в режиме proxy (там Bearer ставит dev-сервер). */
export function authHeaders(conn: Connection | null): Record<string, string> {
  return conn?.token ? { Authorization: `Bearer ${conn.token}` } : {};
}

/**
 * URL для всего, что браузер запрашивает сам, без наших заголовков:
 * `EventSource`, `<img src>`, `<video>`, `<a href>`. Ни один из них не умеет
 * `Authorization`, поэтому при прямом подключении токен едет в query.
 *
 * Цена решения честная, но разная для двух случаев:
 *  - SSE: `EventSource` — единственный способ сохранить авто-переподключение
 *    (fetch+ReadableStream его теряет, и лента молча умирает после первого
 *    разрыва). Для этого ядро уже принимает `?token=` на потоковых GET.
 *  - медиа: иначе картинки/видео сессии просто не откроются на чужом ядре;
 *    здесь токен в query — тоже компромисс (он попадёт в лог прокси), но
 *    альтернатива — качать каждый файл в blob через fetch, то есть терять
 *    range-запросы и стриминг видео.
 * В обоих случаях ядро обязано принимать `?token=` ТОЛЬКО на GET-чтении, и в
 * отчёте это записано как требование к нему.
 */
export function queryAuthUrl(path: string, conn: Connection | null): string {
  const url = apiUrl(path, conn);
  if (!conn?.token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(conn.token)}`;
}

/**
 * Есть ли на этой странице vite-прокси `/api`.
 *
 * Отвечает конфиг сборки (`define` в `vite.config.ts`), а не `import.meta.env.DEV`:
 * прод-веб тоже живёт под `vite` (порт 5180), то есть DEV=true и там, где прокси
 * есть, и там, где его выключили (`SNENS_PROXY=0`). Прямая проверка «есть ли
 * /api» запросом не годится: без прокси она отдаёт 404 от самого vite, и это
 * неотличимо от «ядро лежит».
 *
 * `typeof` по необъявленному имени безопасен (в `node --test` константы нет).
 */
declare const __SNENS_PROXY__: boolean | undefined;

export function hasProxy(): boolean {
  return typeof __SNENS_PROXY__ !== "undefined" && __SNENS_PROXY__ === true;
}

/**
 * Где запущен клиент — для бейджа в шапке и заголовка вкладки.
 *
 * `injected` означает окно оболочки (Tauri): она единственная кладёт адрес в
 * `window.__SNENS__`. Остальные два источника — браузер: `stored` после
 * пейринга и `proxy` на dev/прод-вебе. Отдельного значения `browser` нет
 * намеренно: человеку важно отличать упакованное приложение от вкладки, а
 * способ получения адреса — деталь реализации, её видно в статус-строке
 * (`hostOf`). Устаревшее/неизвестное значение источника — тоже `web`: врать
 * про десктоп хуже, чем не сказать ничего лишнего.
 */
export function surfaceLabel(source: ConnectionSource): "desktop" | "web" {
  return source === "injected" ? "desktop" : "web";
}

/** Хост для индикатора «подключено к …». */
export function hostOf(conn: Connection | null): string {
  if (!conn) return "локальный /api";
  try {
    return new URL(conn.baseUrl).host;
  } catch {
    return conn.baseUrl;
  }
}

/** Успешный ответ `POST /v1/pair/claim`. */
export interface ClaimReply {
  token: string;
  clientId: string;
}

/**
 * Разбор ответа claim. Строгая проверка полей, а не `as ClaimReply`: при
 * расхождении контракта лучше показать «ядро ответило не тем», чем сохранить
 * пустой токен и получить 401 на каждом запросе без объяснения.
 */
export function parseClaim(body: unknown): ClaimReply | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { token?: unknown; client_id?: unknown };
  const token = typeof b.token === "string" ? b.token.trim() : "";
  const clientId = typeof b.client_id === "string" ? b.client_id.trim() : "";
  if (!token || !clientId) return null;
  return { token, clientId };
}

/**
 * Текст ошибки ядра: `{error: {code, message}}` → «code: message».
 * Message отдаём первым по смыслу («код истёк»), код в скобках: человек читает
 * причину, а код нужен тому, кто разбирается в логах.
 */
export function errorText(body: unknown, fallback = "ошибка"): string {
  if (body && typeof body === "object") {
    const e = (body as { error?: { code?: unknown; message?: unknown } }).error;
    const code = typeof e?.code === "string" ? e.code : "";
    const msg = typeof e?.message === "string" ? e.message : "";
    if (msg && code) return `${msg} (${code})`;
    if (msg) return msg;
    if (code) return code;
  }
  if (typeof body === "string" && body.trim()) return body.trim();
  return fallback;
}
