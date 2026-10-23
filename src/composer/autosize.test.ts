/**
 * Тесты высоты composer'а: рост по содержимому, предел окна, возврат к строке.
 * Запуск: `npm test` (node --test, модуль чистый — DOM не нужен).
 *
 * Проверяем ровно те три свойства, из-за которых поле «кривоватое»:
 *  1. короткий текст = одна строка (высота не прыгает вниз, не растёт раньше);
 *  2. длинный текст упирается в предел, и появляется внутренний скролл;
 *  3. мусор на входе (NaN, нулевой предел) не ломает раскладку.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { autosize, maxHeightFor, needsScroll } from "./autosize.ts";

test("короткое содержимое — по scrollHeight", () => {
  assert.equal(autosize(44, 300), 44);
  assert.equal(autosize(120, 300), 120);
});

test("длинное содержимое упирается в предел", () => {
  assert.equal(autosize(900, 300), 300);
  assert.equal(needsScroll(900, 300), true);
  assert.equal(needsScroll(120, 300), false);
});

test("нижняя граница держит одну строку", () => {
  assert.equal(autosize(0, 300, 44), 44);
  assert.equal(autosize(20, 300, 44), 44);
  // после очистки поля высота возвращается к строке, а не остаётся высокой
  assert.equal(autosize(0, 300, 44), autosize(44, 300, 44));
});

test("мусор на входе не ломает раскладку", () => {
  assert.equal(autosize(Number.NaN, 300), 0);
  assert.equal(autosize(100, Number.NaN), 100);
  // нулевой/отрицательный предел — «предела нет», а не нулевая высота
  assert.equal(autosize(100, 0), 100);
  assert.equal(autosize(100, -5), 100);
  assert.equal(needsScroll(100, 0), false);
});

test("предел — доля окна с потолком", () => {
  assert.equal(maxHeightFor(1000), 320); // 40% = 400, но потолок 320
  assert.equal(maxHeightFor(600), 240);
  assert.equal(maxHeightFor(0), 320); // окно неизвестно — потолок
});
