/**
 * Тесты правил дока подагентов: иерархия, длительность работы, статус.
 *
 * Проверяем ровно то, что нельзя увидеть глазами на скриншоте: что дети второго
 * уровня попадают в дерево своего родителя, что цикл в порченых метаданных не
 * вешает рендер, и что «работает 3м» не превращается в «заняло 3м» у живого.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { agentStatus, agentTree, agentOwner, flatten, runningIn, workedMs } from "./lib/agent.ts";
import { worked } from "./lib/time.ts";
import type { SessionInfo } from "./api.ts";

/** Сессия: поля по умолчанию — как у обычной, поверх них то, что нужно тесту. */
function s(id: string, over: Partial<SessionInfo> = {}): SessionInfo {
  return { id, surface: "local", state: "idle", run_id: null, ...over };
}

test("дерево подагентов: дети второго уровня висят на своём родителе", () => {
  const sessions = [
    s("root"),
    s("a", { parent: "root" }),
    s("b", { parent: "root" }),
    // Подагент запустил своего: сплющивать его в первый уровень нельзя.
    s("a1", { parent: "a" }),
    s("a1x", { parent: "a1" }),
  ];
  const tree = agentTree(sessions, "root");
  assert.deepEqual(
    tree.map((n) => n.session.id),
    ["a", "b"],
  );
  assert.deepEqual(
    tree[0].children.map((n) => n.session.id),
    ["a1"],
  );
  assert.equal(tree[0].children[0].children[0].session.id, "a1x");
  assert.deepEqual(
    tree[0].children[0].children[0].session.id,
    "a1x",
  );
  // Глубина — то, по чему UI рисует отступ.
  assert.equal(flatten(tree).find((n) => n.session.id === "a1x")?.depth, 2);
});

test("дерево подагентов: цикл в метаданных не уводит рендер в рекурсию", () => {
  // Порченые данные: a — ребёнок b, b — ребёнок a. Такое возможно после ручной
  // правки журнала, и падать из-за этого интерфейс не должен.
  const sessions = [s("root"), s("a", { parent: "root" }), s("b", { parent: "a" }), s("evil", { parent: "b" })];
  const tree = agentTree(sessions, "root");
  const ids = flatten(tree).map((n) => n.session.id);
  assert.equal(new Set(ids).size, ids.length, "узел не должен повторяться");
  // Цикл замыкается сам на себя — дерево просто обрывается.
  assert.deepEqual(tree.map((n) => n.session.id), ["a"]);
});

test("хозяин списка: на подагенте показываем его рабочую группу", () => {
  const sessions = [s("root"), s("kid", { parent: "root" })];
  assert.equal(agentOwner(sessions, "kid"), "root");
  assert.equal(agentOwner(sessions, "root"), "root");
  assert.equal(agentOwner(sessions, null), null);
});

test("длительность: у работающего растёт до «сейчас», у закрытого — до Done", () => {
  const running = s("x", { started_at: 100, state: "running" });
  assert.equal(workedMs(running, 160), 60_000);
  // Та же сессия через минуту — больше на минуту, а не тот же снимок.
  assert.equal(workedMs(running, 220), 120_000);
  const closed = s("x", { started_at: 100, done_at: 130, done: "ok" });
  assert.equal(workedMs(closed, 999), 30_000, "у закрытого Done фиксирует конец");
  // Нет старта — считать нечего, и «0с» не показываем.
  assert.equal(workedMs(s("x"), 999), undefined);
  // Часы разъехались — отрицательное не показываем.
  assert.equal(workedMs(s("x", { started_at: 200 }), 100), 0);
});

test("подпись длительности: секунды, минуты, часы", () => {
  assert.equal(worked(42_000), "42с");
  assert.equal(worked(192_000), "3м 12с");
  assert.equal(worked(3_840_000), "1ч 04м");
  assert.equal(worked(undefined), "");
});

test("статус: работает / готов / лимит / прерван — разные вещи", () => {
  const now = 1000;
  const running = agentStatus(s("x", { state: "running", started_at: 900, turns: 3 }), now);
  assert.equal(running.kind, "run");
  assert.equal(running.text, "работает");
  assert.equal(running.workedMs, 100_000);

  const ok = agentStatus(s("x", { state: "idle", done: "ok", turns: 2 }), now);
  assert.equal(ok.kind, "ok");
  assert.equal(ok.text, "готов");

  // Лимит ходов — не поломка, а исчерпанный потолок: подпись об этом.
  const limit = agentStatus(s("x", { state: "failed", done: "limit", turns: 200 }), now);
  assert.equal(limit.kind, "err");
  assert.match(limit.text, /лимит ходов/);

  // Процесса нет и Done нет — «прерван», а не «готов».
  const interrupted = agentStatus(s("x", { state: "interrupted", turns: 1 }), now);
  assert.equal(interrupted.kind, "err");
  assert.match(interrupted.text, /прерван/);
});

test("счётчик работающих считает всё дерево, а не только первый уровень", () => {
  const sessions = [
    s("root"),
    s("a", { parent: "root", state: "running" }),
    s("a1", { parent: "a", state: "running" }),
    s("b", { parent: "root", state: "idle", done: "ok" }),
  ];
  assert.equal(runningIn(agentTree(sessions, "root")), 2);
});
