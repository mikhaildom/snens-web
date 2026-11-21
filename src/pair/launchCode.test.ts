/**
 * Код пейринга из адреса страницы (`#pair=…`): читается, стирается из адреса,
 * для автоподключения отдаётся один раз. Запуск: `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { resetLaunchCode, takeLaunchCode, takeLaunchOnce } from "./launchCode.ts";

function page(href: string) {
  const u = new URL(href);
  const replaced: string[] = [];
  Object.assign(globalThis, {
    location: {
      hash: u.hash,
      pathname: u.pathname,
      search: u.search,
      protocol: u.protocol,
      origin: u.origin,
    },
    history: { replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) },
  });
  resetLaunchCode();
  return replaced;
}

test("код из #pair= читается и стирается из адреса", () => {
  const replaced = page("http://127.0.0.1:7420/?x=1#pair=049-770");
  assert.equal(takeLaunchCode(), "049-770");
  assert.deepEqual(replaced, ["/?x=1"]);
  // повторный вызов — тот же код, адрес второй раз не трогаем
  assert.equal(takeLaunchCode(), "049-770");
  assert.equal(replaced.length, 1);
});

test("для автоподключения — адрес страницы и код, один раз", () => {
  page("http://127.0.0.1:7420/#pair=049-770");
  assert.deepEqual(takeLaunchOnce(), { baseUrl: "http://127.0.0.1:7420", code: "049-770" });
  assert.equal(takeLaunchOnce(), null);
});

test("без кода или с чужим хешем — ничего", () => {
  let replaced = page("http://127.0.0.1:7420/#session=abc");
  assert.equal(takeLaunchCode(), null);
  assert.equal(takeLaunchOnce(), null);
  assert.equal(replaced.length, 0);
  replaced = page("http://127.0.0.1:7420/#pair=<script>");
  assert.equal(takeLaunchCode(), null);
});

test("страница не по http(s) — адрес ядра не угадываем", () => {
  page("file:///C:/snens/web/index.html#pair=049-770");
  assert.equal(takeLaunchOnce(), null);
});
