/**
 * Тесты клавиатурных правил composer'а.
 *
 * Баг, ради которого это отдельный модуль: с телефона Enter отправлял
 * сообщение. Правило «Enter отправляет» верно только для физической
 * клавиатуры, и проверить это глазами на скриншоте нельзя.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { composerHint, enterSends } from "./keys.ts";

const enter = (extra: Partial<{ shiftKey: boolean; isComposing: boolean }> = {}) => ({
  key: "Enter",
  shiftKey: false,
  isComposing: false,
  ...extra,
});

test("десктоп: enter отправляет, shift+enter — перенос", () => {
  assert.equal(enterSends(enter(), false), true);
  assert.equal(enterSends(enter({ shiftKey: true }), false), false);
});

test("тач-экран: enter — перенос строки, не отправка", () => {
  assert.equal(enterSends(enter(), true), false);
  assert.equal(enterSends(enter({ shiftKey: true }), true), false);
});

test("IME: enter подтверждает композицию, а не отправляет", () => {
  assert.equal(enterSends(enter({ isComposing: true }), false), false);
});

test("не enter — не отправка", () => {
  assert.equal(enterSends({ key: "a", shiftKey: false }, false), false);
  assert.equal(enterSends({ key: "NumpadEnter", shiftKey: false }, false), false);
});

test("подсказка не врёт про способ отправки", () => {
  assert.match(composerHint(false), /enter — отправить/);
  assert.match(composerHint(true), /enter — перенос/);
  assert.match(composerHint(true), /кнопкой/);
});
