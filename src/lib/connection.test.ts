/**
 * Тесты слоя соединения: приоритет источников, разбор ответа claim, форма URL.
 * Запуск: `npm test` (node --test, без зависимостей — модули чистые).
 *
 * Проверяем три свойства, из-за нарушения которых клиент молча ходит не туда:
 *  1. оболочка (`window.__SNENS__`) перебивает localStorage, а пустое — уходит
 *     в режим proxy (то есть dev-режим не меняется);
 *  2. битое/чужое в localStorage или в инжекте не роняет клиент, а означает
 *     «не подключено»;
 *  3. прямой адрес склеивается с `/v1/...`, а proxy-режим оставляет `/api`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  apiUrl,
  authHeaders,
  clearConnection,
  connection,
  errorText,
  hostOf,
  normalizeBaseUrl,
  parseClaim,
  parseConnection,
  queryAuthUrl,
  readStored,
  resolveConnection,
  saveConnection,
  STORAGE_KEY,
  surfaceLabel,
} from "./connection.ts";

/** Подделка localStorage: тесту нужно только чтение ключа. */
function storage(value: unknown): Pick<Storage, "getItem"> {
  return {
    getItem: (k: string) =>
      k === STORAGE_KEY ? (typeof value === "string" ? value : JSON.stringify(value)) : null,
  };
}

test("без инжекта и localStorage — режим proxy", () => {
  const r = resolveConnection({ injected: undefined, storage: storage(null) });
  assert.equal(r.source, "proxy");
  assert.equal(r.conn, null);
  // Поведение dev-режима: относительный /api, без заголовка.
  assert.equal(apiUrl("/v1/sessions", r.conn), "/api/v1/sessions");
  assert.deepEqual(authHeaders(r.conn), {});
});

test("инжект оболочки перебивает localStorage", () => {
  const r = resolveConnection({
    injected: { baseUrl: "http://100.73.69.107:7420", token: "shell" },
    storage: storage({ baseUrl: "http://other:7420", token: "paired" }),
  });
  assert.equal(r.source, "injected");
  assert.deepEqual(r.conn, { baseUrl: "http://100.73.69.107:7420", token: "shell" });
});

test("битый инжект откатывается на сохранённое соединение", () => {
  const r = resolveConnection({
    injected: { baseUrl: 42, token: "x" },
    storage: storage({ baseUrl: "http://paired:7420", token: "paired" }),
  });
  assert.equal(r.source, "stored");
  assert.equal(r.conn?.token, "paired");
});

test("битый JSON в localStorage — «не подключено», а не падение", () => {
  assert.equal(readStored(storage("{не json")), null);
  const r = resolveConnection({ storage: storage("{не json") });
  assert.equal(r.source, "proxy");
});

test("адрес без схемы получает http, хвостовой слэш снимается", () => {
  assert.equal(normalizeBaseUrl("100.73.69.107:7420/"), "http://100.73.69.107:7420");
  assert.equal(normalizeBaseUrl(" https://h.tailnet.ts.net/snens/ "), "https://h.tailnet.ts.net/snens");
  // Порт и путь сохраняются: ядро может стоять за обратным прокси с префиксом.
  assert.equal(normalizeBaseUrl("http://h:7461/a/b"), "http://h:7461/a/b");
});

test("негодный адрес — null, а не мусорный URL", () => {
  assert.equal(normalizeBaseUrl(""), null);
  assert.equal(normalizeBaseUrl("   "), null);
  assert.equal(normalizeBaseUrl("ftp://h:21"), null);
  assert.equal(normalizeBaseUrl("http://"), null);
});

test("прямое подключение: абсолютный URL и Bearer", () => {
  const conn = parseConnection({ baseUrl: "http://h:7461/", token: "t1" });
  assert.deepEqual(conn, { baseUrl: "http://h:7461", token: "t1" });
  assert.equal(apiUrl("/v1/sessions/abc/history", conn), "http://h:7461/v1/sessions/abc/history");
  assert.deepEqual(authHeaders(conn), { Authorization: "Bearer t1" });
});

test("пустой токен: адрес прямой, заголовка нет", () => {
  // Так выглядит адрес за обратным прокси со своей аутентификацией.
  const conn = parseConnection({ baseUrl: "https://proxy/snens", token: "" });
  assert.ok(conn);
  assert.deepEqual(authHeaders(conn), {});
});

test("токен в query — только когда он есть, и с учётом готового ?", () => {
  const conn = { baseUrl: "http://h:7461", token: "t 1" };
  assert.equal(queryAuthUrl("/v1/events", conn), "http://h:7461/v1/events?token=t%201");
  assert.equal(
    queryAuthUrl("/v1/sessions/s/events?after=7", conn),
    "http://h:7461/v1/sessions/s/events?after=7&token=t%201",
  );
  // В режиме proxy токен не нужен вовсе — относительный адрес как раньше.
  assert.equal(queryAuthUrl("/v1/events", null), "/api/v1/events");
});

test("разбор claim: оба поля обязательны", () => {
  assert.deepEqual(parseClaim({ token: "tsk", client_id: "cid-1" }), {
    token: "tsk",
    clientId: "cid-1",
  });
  // Ядро старше контракта не отдаст client_id — это не соединение, а мусор.
  assert.equal(parseClaim({ token: "tsk" }), null);
  assert.equal(parseClaim({ token: "", client_id: "cid" }), null);
  assert.equal(parseClaim(null), null);
  assert.equal(parseClaim("ok"), null);
});

test("ошибка ядра читается человеком, код — рядом", () => {
  assert.equal(
    errorText({ error: { code: "pairing", message: "код истёк" } }),
    "код истёк (pairing)",
  );
  assert.equal(errorText({ error: { message: "нет связи" } }), "нет связи");
  assert.equal(errorText(null, "401 Unauthorized"), "401 Unauthorized");
});

test("хост для индикатора: имя и порт, без схемы", () => {
  assert.equal(hostOf({ baseUrl: "https://h.tailnet.ts.net:7461/x", token: "" }), "h.tailnet.ts.net:7461");
  assert.equal(hostOf(null), "локальный /api");
});

/**
 * Запись/очистка трогают глобальный localStorage, которого в node нет:
 * подменяем его на объект в памяти. Заодно проверяется, что `clearConnection`
 * действительно возвращает клиент в режим proxy, а не оставляет пустой объект.
 */
test("пейринг сохраняется и снимается", () => {
  const box = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  const had = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => box.get(k) ?? null,
    setItem: (k: string, v: string) => box.set(k, v),
    removeItem: (k: string) => box.delete(k),
  };
  try {
    saveConnection({ baseUrl: "http://h:7461", token: "t" });
    assert.equal(connection().source, "stored");
    assert.equal(connection().conn?.token, "t");
    clearConnection();
    assert.equal(box.has(STORAGE_KEY), false);
    assert.equal(connection().source, "proxy");
  } finally {
    // Возвращаем как было: соседние тесты не должны зависеть от порядка.
    if (had === undefined) delete g.localStorage;
    else g.localStorage = had;
  }
});

/**
 * Бейдж поверхности: одно правило на весь клиент. `injected` — это окно
 * оболочки (Tauri), и там «web» было бы враньём; всё остальное — браузер.
 */
test("surfaceLabel: desktop только у инжекта оболочки", () => {
  assert.equal(surfaceLabel("injected"), "desktop");
  assert.equal(surfaceLabel("stored"), "web");
  assert.equal(surfaceLabel("proxy"), "web");
});
