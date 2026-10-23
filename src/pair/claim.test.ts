/**
 * Тесты обмена кода пейринга на токен (`pair/claim.ts`).
 *
 * `fetch` подменяется: проверяется контракт (что уходит на ядро, что клиент
 * делает с ответом), а не сеть. Живьём тот же путь проверен скриптом на
 * поднятом ядре (см. отчёт), и здесь он зафиксирован, чтобы не сломаться молча.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { claim, validatePair } from "./claim.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Подмена fetch: запоминает запрос, отдаёт заданный ответ. */
function stub(reply: { status?: number; body: unknown }, seen: { url?: string; body?: unknown } = {}) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const status = reply.status ?? 200;
    return new Response(JSON.stringify(reply.body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return seen;
}

test("успех: POST на /v1/pair/claim, соединение из ответа", async () => {
  const seen = stub({ body: { token: "tsk", client_id: "cid" } });
  const out = await claim({ baseUrl: "100.73.69.107:7461/", code: " 123-456 ", name: " ноутбук " });
  assert.equal(seen.url, "http://100.73.69.107:7461/v1/pair/claim");
  assert.deepEqual(seen.body, { code: "123-456", name: "ноутбук" });
  assert.ok(out.ok);
  // Адрес нормализован: сохранённое соединение сразу годится для apiUrl.
  assert.deepEqual(out.conn, { baseUrl: "http://100.73.69.107:7461", token: "tsk" });
  assert.equal(out.clientId, "cid");
});

test("401 от ядра: текст ошибки, а не исключение", async () => {
  stub({ status: 401, body: { error: { code: "pairing", message: "код неверный" } } });
  const out = await claim({ baseUrl: "http://h:7461", code: "000-000", name: "x" });
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.error, "код неверный (pairing)");
});

test("ответ без client_id — не соединение", async () => {
  stub({ body: { token: "tsk" } });
  const out = await claim({ baseUrl: "http://h:7461", code: "1", name: "x" });
  assert.equal(out.ok, false);
});

test("непустой не-JSON ответ не роняет разбор", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>502 Bad Gateway</html>", { status: 502 })) as typeof fetch;
  const out = await claim({ baseUrl: "http://h:7461", code: "1", name: "x" });
  assert.equal(out.ok, false);
  assert.match(out.ok === false ? out.error : "", /502/);
});

test("сеть не дошла — говорим про связь и адрес", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  const out = await claim({ baseUrl: "http://h:7461", code: "1", name: "x" });
  assert.equal(out.ok, false);
  assert.match(out.ok === false ? out.error : "", /нет связи с ядром \(http:\/\/h:7461\)/);
});

test("ввод проверяется до сети", async () => {
  // fetch не подменён: если проверка не сработает, тест дойдёт до реальной сети.
  assert.match(validatePair({ baseUrl: "", code: "1", name: "x" }) ?? "", /адрес/);
  assert.match(validatePair({ baseUrl: "http://h:1", code: "  ", name: "x" }) ?? "", /код/);
  assert.equal(validatePair({ baseUrl: "http://h:1", code: "1", name: "x" }), null);
  const out = await claim({ baseUrl: "ftp://h", code: "1", name: "x" });
  assert.equal(out.ok, false);
});
