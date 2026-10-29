/**
 * Тесты разбора фенсов `mermaid`.
 *
 * Проверяем свойства, из-за которых лента ломается:
 *  1. обычный код остаётся кодом — регресс всего markdown;
 *  2. фенс без языка, но с `graph TD` в первой строке — это схема (модель
 *     регулярно не пишет `mermaid`);
 *  3. незакрытый фенс — схема в работе, а не кусок текста;
 *  4. фенс внутри фенса (пример кода) схемой не становится.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { looksLikeMermaid, minWidth, splitMermaid, viewBoxWidth } from "./mermaid.ts";

test("обычный код-фенс остаётся текстом", () => {
  const src = "до\n```js\nconst a = 1;\n```\nпосле";
  const segs = splitMermaid(src);
  assert.deepEqual(
    segs.map((s) => s.kind),
    ["text"],
  );
  assert.match(segs[0].kind === "text" ? segs[0].text : "", /const a = 1/);
});

test("фенс mermaid становится схемой, текст вокруг сохраняется", () => {
  const src = "до\n```mermaid\ngraph TD\n  a --> b\n```\nпосле";
  const segs = splitMermaid(src);
  assert.deepEqual(
    segs.map((s) => s.kind),
    ["text", "mermaid", "text"],
  );
  const mid = segs[1];
  assert.equal(mid.kind === "mermaid" && mid.code, "graph TD\n  a --> b");
  assert.equal(mid.kind === "mermaid" && mid.open, false);
});

test("фенс без языка распознаётся по первой строке", () => {
  const src = "```\ngraph TD\n  a --> b\n```";
  const segs = splitMermaid(src);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].kind, "mermaid");
});

test("незакрытый фенс — схема в работе", () => {
  const segs = splitMermaid("текст\n```mermaid\ngraph TD\n  a --> b");
  assert.equal(segs.length, 2);
  const last = segs[1];
  assert.equal(last.kind, "mermaid");
  assert.equal(last.kind === "mermaid" && last.open, true);
});

test("фенс с чужим языком не трогаем, даже если внутри mermaid", () => {
  const src = "```md\n```mermaid\ngraph TD\n```\n```";
  const segs = splitMermaid(src);
  assert.deepEqual(
    segs.map((s) => s.kind),
    ["text"],
  );
});

test("тильды закрываются только тильдами", () => {
  // Закрывающие бэктики внутри тильдованного фенса не должны его закрыть:
  // иначе схема обрывалась бы на первой строке кода.
  const src = "~~~mermaid\ngraph TD\n```\na --> b\n~~~";
  const segs = splitMermaid(src);
  assert.equal(segs[0].kind, "mermaid");
  assert.equal(segs[0].kind === "mermaid" && segs[0].open, false);
  assert.match(segs[0].kind === "mermaid" ? segs[0].code : "", /```/);
});

test("пустое тело без языка схемой не считается", () => {
  assert.equal(splitMermaid("```\nhello\n```")[0].kind, "text");
});

test("looksLikeMermaid смотрит на первую значимую строку", () => {
  assert.equal(looksLikeMermaid("\n%% комментарий\nflowchart LR\n a-->b"), true);
  assert.equal(looksLikeMermaid("const x = 1"), false);
  assert.equal(looksLikeMermaid(""), false);
});

test("ширина viewBox берётся третьим числом", () => {
  assert.equal(viewBoxWidth('<svg viewBox="4 4 856.5 376">'), 856.5);
  assert.equal(viewBoxWidth('<svg viewBox="0 0 120 40">'), 120);
  assert.equal(viewBoxWidth("<svg>"), 0);
});

test("схема не ужимается сильнее MIN_SCALE", () => {
  // 800 * 0.75 = 600: на телефоне показываем 600 и скроллим, а не 8px шрифтом.
  assert.equal(minWidth(800), 600);
  assert.equal(minWidth(0), 0);
});
