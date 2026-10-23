/**
 * Обмен кода пейринга на токен устройства (`POST /v1/pair/claim`).
 *
 * Отдельно от `lib/connection.ts` (там правила «откуда брать соединение», без
 * сети) и от формы (там разметка): это единственный запрос, который клиент
 * делает БЕЗ токена, и единственное место, где нужно честно объяснить, почему
 * он не идёт через `api`.
 *
 * Поля контракта — как у ядра (`surface_pairing::Claim`/`ClaimReply`):
 * запрос `{code, name}`, ответ `{token, client_id}`, ошибка `{error:{code,message}}`.
 * Ответ разбирается здесь же (`parseClaim`), чтобы форма получала либо
 * готовое соединение, либо текст для человека — и ничего между ними.
 */
import {
  errorText,
  normalizeBaseUrl,
  parseClaim,
  type ClaimReply,
  type Connection,
} from "../lib/connection.ts";

export interface PairInput {
  /** Адрес ядра так, как его ввёл человек: «100.73.69.107:7420» тоже годится. */
  baseUrl: string;
  code: string;
  name: string;
}

/** Что вернула попытка: соединение для сохранения либо текст ошибки. */
export type ClaimOutcome =
  | { ok: true; conn: Connection; clientId: string }
  | { ok: false; error: string };

/**
 * Сколько ждём ответа на claim. Дольше — значит адрес введён неверно (или
 * ядро за файрволом), и человеку полезнее узнать это сейчас, а не смотреть на
 * вечный спиннер.
 */
const CLAIM_TIMEOUT_MS = 15000;

/**
 * Проверка ввода до сети: адрес разбирается, код непустой.
 * Ошибки текстом — их видит человек на экране подключения.
 */
export function validatePair(input: PairInput): string | null {
  if (!normalizeBaseUrl(input.baseUrl)) return "адрес ядра: нужен http(s)://хост:порт";
  if (!input.code.trim()) return "введи код пейринга";
  return null;
}

/**
 * Обменять код на токен. Никогда не бросает: результат — `ClaimOutcome`,
 * потому что каждая ветка ошибки оканчивается текстом на экране, а не
 * исключением, которое придётся ловить в компоненте.
 */
export async function claim(input: PairInput): Promise<ClaimOutcome> {
  const problem = validatePair(input);
  if (problem) return { ok: false, error: problem };
  const base = normalizeBaseUrl(input.baseUrl)!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLAIM_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(`${base}/v1/pair/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: input.code.trim(), name: input.name.trim() }),
      signal: ctrl.signal,
    });
  } catch (e) {
    // Сеть до ядра не дошла: самое частое — опечатка в адресе, порт закрыт
    // файрволом или ядро не запущено с `--allow-remote`.
    const why = ctrl.signal.aborted ? "ядро не ответило за 15 с — проверь адрес и что ядро запущено" : "нет связи с ядром — проверь адрес и что ядро запущено";
    return { ok: false, error: `${why} (${base}): ${String(e instanceof Error ? e.message : e)}` };
  } finally {
    clearTimeout(timer);
  }

  const body: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    // 401 здесь — «код не подошёл/истёк», а не «нет токена»: у нас его и нет.
    return { ok: false, error: errorText(body, `${r.status} ${r.statusText}`) };
  }
  const reply: ClaimReply | null = parseClaim(body);
  if (!reply) return { ok: false, error: "ядро ответило непонятно — обнови ядро" };
  return { ok: true, conn: { baseUrl: base, token: reply.token }, clientId: reply.clientId };
}
