/**
 * Тесты сборки документа артефакта и троттлинга.
 *
 * Главное свойство, которое здесь проверяется: артефакт с полным `<!doctype>` от
 * модели и голый фрагмент получают ОДНУ И ТУ ЖЕ политику. Второе — что черновик
 * стрима не исполняет скрипты.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseHead } from "./artifact.ts";
import { artifactSize, composeDocument } from "./artifactDoc.ts";
import { intervalFor, shouldRender, afterRender } from "./throttle.ts";

const head = parseHead("id=q").head;

test("фрагмент получает обёртку с CSP, темой и шимом", () => {
  const doc = composeDocument({ head, body: "<p>привет</p>", scripts: true });
  assert.match(doc, /^<!doctype html>/);
  assert.match(doc, /Content-Security-Policy/);
  assert.match(doc, /connect-src 'none'/);
  assert.match(doc, /window\.snens=/);
  assert.match(doc, /<p>привет<\/p>/);
});

test("полный документ от модели не заворачивается вторым <html>", () => {
  const body = "<!doctype html><html><head><title>t</title></head><body><b>x</b></body></html>";
  const doc = composeDocument({ head, body, scripts: true });
  assert.equal(doc.match(/<html/gi)?.length, 1);
  assert.equal(doc.match(/<body/gi)?.length, 1);
  assert.match(doc, /Content-Security-Policy/);
  // Политика обязана стоять ДО пользовательской разметки: иначе она опоздает.
  assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf("<title>t</title>"));
  assert.match(doc, /<b>x<\/b>/);
});

test("в черновике скрипты выключены, в финале включены", () => {
  const draft = composeDocument({ head, body: "<p>1</p>", scripts: false });
  assert.match(draft, /script-src 'none'/);
  assert.doesNotMatch(draft, /unhandledrejection/);
  const final = composeDocument({ head, body: "<p>1</p>", scripts: true });
  assert.match(final, /script-src 'unsafe-inline'/);
  assert.match(final, /unhandledrejection/);
});

test("библиотека инжектится до тела", () => {
  const doc = composeDocument({
    head,
    body: "<my-quiz></my-quiz>",
    scripts: true,
    library: [{ name: "quiz.js", source: "customElements.define('my-quiz', class extends HTMLElement{})" }],
  });
  assert.ok(doc.indexOf("customElements.define") < doc.indexOf("<my-quiz>"));
});

test("данные preload экранируются от закрытия script", () => {
  const doc = composeDocument({ head, body: "x", scripts: true, data: { s: "</script><b>" } });
  assert.doesNotMatch(doc, /<\/script><b>/);
  assert.match(doc, /<\\\/script/);
});

test("высота меряется по содержимому, а не по окну iframe", () => {
  // Регресс: `documentElement.scrollHeight` в iframe равен его собственной
  // высоте, из-за чего артефакт навсегда оставался на дефолтных 220px.
  const doc = composeDocument({ head, body: "<p>1</p>", scripts: true });
  assert.match(doc, /getBoundingClientRect\(\)\.height/);
  assert.doesNotMatch(doc, /documentElement\.scrollHeight/);
});

test("размер считается в килобайтах и строках", () => {
  assert.equal(artifactSize(""), "0 Б · 0 строк");
  assert.match(artifactSize("a\nb"), /^3 Б · 2 строки$/);
  assert.match(artifactSize("x".repeat(2048)), /^2\.0 КБ · 1 строка$/);
});

test("троттлинг: первый кадр немедленно, дальше по интервалу", () => {
  let st = { at: 0, bytes: 0, round: 0 };
  assert.equal(shouldRender(1000, st, 20), true, "первый кадр — даже крошечный");
  st = afterRender(1000, 20, 0);
  assert.equal(shouldRender(1100, st, 900), false, "раньше интервала не рисуем");
  assert.equal(shouldRender(1500, st, 900), true);
  st = afterRender(1500, 900, 1);
  assert.equal(shouldRender(2100, st, 1000), false, "прирост меньше MIN_GROWTH");
  assert.equal(shouldRender(2500, st, 2000), true);
});

test("интервалы растут и упираются в потолок", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(intervalFor), [500, 500, 500, 1000, 1000, 2000, 2000]);
});

test("уменьшение тела (правка фенса) не считается ростом", () => {
  const st = afterRender(1000, 5000, 3);
  assert.equal(shouldRender(9999, st, 4000), false);
});
