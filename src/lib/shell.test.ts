/**
 * Проверка ветки оболочки: где клиент считает себя окном приложения, а где —
 * вкладкой браузера.
 *
 * Тест важен не ради самих флагов, а ради правила «в окне соединение хранит
 * оболочка, в браузере — localStorage». Ошибка здесь означает либо пейринг,
 * который не переживает перезапуск окна, либо окно, поднимающее второе ядро
 * поверх уже подключённого чужого.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// `shell.ts` читает `globalThis.__SNENS__` и `__TAURI_INTERNALS__` на каждом
// вызове (не кэширует на старте модуля) — поэтому состояние можно менять между
// тестами без перезагрузки модуля.
const g = globalThis as Record<string, unknown>;

async function load() {
  // Свежий импорт на каждый тест: модуль без состояния, кеш импорта не мешает.
  return import("./shell.ts");
}

function reset() {
  delete g.__SNENS__;
  delete g.__TAURI_INTERNALS__;
}

test("браузер: не оболочка, даже если флаг shell стоит без IPC", async () => {
  reset();
  g.__SNENS__ = { shell: true };
  const { inShell } = await load();
  assert.equal(inShell(), false, "флаг без __TAURI_INTERNALS__ — это не окно");
  reset();
});

test("окно: оболочка видна только при живом IPC", async () => {
  reset();
  g.__SNENS__ = { shell: true };
  g.__TAURI_INTERNALS__ = { invoke: async () => null };
  const { inShell } = await load();
  assert.equal(inShell(), true);
  reset();
});

test("режим ядра: remote читается из инжекта, без него — своё ядро", async () => {
  reset();
  g.__SNENS__ = { shell: true, remote: true };
  const { isRemote } = await load();
  assert.equal(isRemote(), true);
  g.__SNENS__ = { shell: true };
  assert.equal(isRemote(), false);
  reset();
});

test("вызов команды доносит адрес и токен как есть", async () => {
  reset();
  const calls: Array<{ cmd: string; args: unknown }> = [];
  g.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: unknown) => {
      calls.push({ cmd, args });
      return null;
    },
  };
  const { pairShell, forgetShellRemote, reloadShell } = await load();
  assert.equal(await pairShell("http://100.64.0.1:7420", "t".repeat(40)), null);
  assert.equal(await forgetShellRemote(), null);
  assert.equal(await reloadShell(), null);
  assert.deepEqual(
    calls.map((c) => c.cmd),
    ["set_remote", "clear_remote", "reopen"],
  );
  assert.deepEqual(calls[0].args, { baseUrl: "http://100.64.0.1:7420", token: "t".repeat(40) });
  reset();
});

test("без IPC вызов не падает, а объясняет причину", async () => {
  reset();
  const { pairShell, forgetShellRemote } = await load();
  assert.match((await pairShell("http://x:1", "t")) ?? "", /не окно приложения/);
  assert.match((await forgetShellRemote()) ?? "", /не окно приложения/);
  reset();
});
