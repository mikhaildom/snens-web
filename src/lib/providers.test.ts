/**
 * Тесты правил панели провайдеров.
 *
 * Проверяем то, чего не видно на скриншоте: что активный профиль нельзя удалить,
 * что правка без ключа не стирает ключ, что имя из пресета не занимает чужое.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activateBlocker,
  draftFromEdit,
  draftFromPreset,
  effectiveLabel,
  freeName,
  hostOf,
  isEmptyDraft,
  keyLabel,
  removeBlocker,
  type ProviderInfo,
  type ProviderState,
} from "./providers.ts";

function p(name: string, over: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    name,
    base_url: `https://${name}/v1`,
    model: "m/one",
    key_env: `SNENS_${name.toUpperCase()}_KEY`,
    key_set: true,
    active: false,
    complete: true,
    ...over,
  };
}

test("активировать нельзя активный, неполный и виртуальный", () => {
  assert.equal(activateBlocker(p("a")), null);
  assert.match(String(activateBlocker(p("a", { active: true }))), /уже активен/);
  // Профиль без модели ядро отвергнет: панель должна сказать это до запроса.
  assert.match(String(activateBlocker(p("a", { complete: false }))), /модели/);
  assert.match(String(activateBlocker(p("(конфиг)", { implicit: true }))), /конфиг/);
});

test("удалить активный нельзя, виртуальный — нечего", () => {
  assert.equal(removeBlocker(p("a")), null);
  assert.match(String(removeBlocker(p("a", { active: true }))), /активный/);
  assert.match(String(removeBlocker(p("(конфиг)", { implicit: true }))), /конфиг/);
});

test("подпись про ключ не показывает значение", () => {
  assert.equal(keyLabel(p("a")), "задан");
  assert.equal(keyLabel(p("a", { key_set: false })), "не задан (SNENS_A_KEY)");
});

test("правка отправляет только изменённое и не стирает ключ", () => {
  const before = p("a");
  // Тот же адрес и модель — пустое тело: PUT без полей ничего не меняет.
  assert.ok(
    isEmptyDraft(
      draftFromEdit(before, { base_url: " https://a/v1/", model: " m/one " }),
    ),
  );
  const draft = draftFromEdit(before, { model: "m/two", key: "" });
  assert.deepEqual(draft, { model: "m/two" });
  assert.ok(!("key" in draft), "пустой ключ уехал бы в .env и стёр бы секрет");
  // Заданный ключ уезжает, а пробелы по краям снимаются.
  assert.deepEqual(draftFromEdit(before, { key: "  sk-1  " }), { key: "sk-1" });
});

test("пресет даёт адрес и модель, имя не занято", () => {
  const preset = {
    name: "nous",
    base_url: "https://inference-api.nousresearch.com/v1",
    model: "deepseek/deepseek-v4.1-flash-1017",
  };
  const draft = draftFromPreset(preset, "  ");
  assert.equal(draft.name, "nous");
  assert.equal(draft.base_url, preset.base_url);
  assert.ok(!("key" in draft), "пресет не должен приносить ключ");
  // Имя занято — предлагаем следующее, а не ловим 409 от ядра.
  assert.equal(freeName("nous", ["nous"]), "nous-2");
  assert.equal(freeName("nous", ["nous", "nous-2"]), "nous-3");
  assert.equal(freeName("", ["x"]), "провайдер");
  assert.equal(freeName("nous", ["other"]), "nous");
});

test("строка состояния показывает адрес и модель, которые реально работают", () => {
  const state: ProviderState = {
    providers: [p("nous", { active: true })],
    active: "nous",
    effective: {
      base_url: "https://inference-api.nousresearch.com/v1",
      model: "deepseek/deepseek-v4.1-flash-1017",
      key_env: "SNENS_NOUS_KEY",
      key_set: true,
    },
    config: "/home/x/.config/snens/config.toml",
    presets: [],
  };
  assert.equal(
    effectiveLabel(state),
    "inference-api.nousresearch.com/v1 · deepseek/deepseek-v4.1-flash-1017",
  );
  // Пустое — говорим словами, а не пустым местом.
  const empty = {
    ...state,
    effective: { base_url: "", model: "", key_env: "K", key_set: false },
  };
  assert.equal(effectiveLabel(empty), "(адрес не задан) · (модель не задана)");
  assert.equal(hostOf("https://openrouter.ai/api/v1/"), "openrouter.ai/api/v1");
  assert.equal(hostOf(""), "");
});
