/**
 * Тесты правил ленты. Запуск: `npm test` (node --test, без зависимостей —
 * `lenta.ts` не импортирует React и типы вырезаются встроенным стриппером Node).
 *
 * Проверяем не «примерно так выглядит», а три свойства, из-за нарушения которых
 * лента перетасовывалась:
 *  1. позиция блока, однажды вставленного, не меняется от последующих событий;
 *  2. текст, написанный до вызова инструмента, остаётся ВЫШЕ него;
 *  3. пачка сворачивает только тулы и шаги без текста, а текст модели виден.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEvent, buildBlocks, collectTools, type LiveItem } from "./lenta.ts";
import type { SurfaceEvent, TranscriptMessage } from "./api.ts";

/** Событие стрима, как его отдаёт ядро: seq монотонный, тип + поля. */
function ev(seq: number, type: string, fields: Record<string, unknown> = {}): SurfaceEvent {
  return { seq, session_id: "s", run_id: "r", type, ...fields };
}

function feed(events: SurfaceEvent[]): LiveItem[] {
  return events.reduce<LiveItem[]>((acc, e) => applyEvent(acc, e), []);
}

/** Краткая подпись ленты: по ней видно и порядок, и склейку. */
function shape(items: LiveItem[]): string[] {
  return items.map((it) =>
    it.kind === "tool" ? `tool:${it.tool.name}:${it.tool.state}` : `${it.kind}:${it.text}`,
  );
}

test("текст до тула остаётся выше тула", () => {
  const items = feed([
    ev(1, "assistant.delta", { kind: "content", text: "начинаю" }),
    ev(2, "tool.started", { call_id: "c1", name: "echo-one" }),
    ev(3, "tool.completed", { call_id: "c1", name: "echo-one", exit: 0, preview: "one" }),
    ev(4, "assistant.delta", { kind: "content", text: "середина" }),
  ]);
  assert.deepEqual(shape(items), ["text:начинаю", "tool:echo-one:ok", "text:середина"]);
});

test("позиция вставленного блока не меняется от следующих событий", () => {
  const first = feed([
    ev(1, "assistant.delta", { kind: "content", text: "a" }),
    ev(2, "tool.started", { call_id: "c1", name: "run" }),
  ]);
  const later = applyEvent(first, ev(3, "assistant.delta", { kind: "reasoning", text: "думаю" }));
  assert.deepEqual(shape(later), ["text:a", "tool:run:running", "reasoning:думаю"]);
  // Результат обновляет тул на месте, а не переставляет его.
  const done = applyEvent(later, ev(4, "tool.completed", { call_id: "c1", exit: 0, preview: "ok" }));
  assert.deepEqual(shape(done), ["text:a", "tool:run:ok", "reasoning:думаю"]);
});

test("рассуждения разных шагов не сливаются в одну простыню", () => {
  const items = feed([
    ev(1, "assistant.delta", { kind: "reasoning", text: "первое " }),
    ev(2, "assistant.delta", { kind: "reasoning", text: "рассуждение" }),
    ev(3, "tool.started", { call_id: "c1", name: "run" }),
    ev(4, "tool.completed", { call_id: "c1", exit: 0 }),
    ev(5, "assistant.delta", { kind: "reasoning", text: "второе" }),
  ]);
  assert.deepEqual(shape(items), [
    "reasoning:первое рассуждение",
    "tool:run:ok",
    "reasoning:второе",
  ]);
});

test("неизвестные события ленту не трогают", () => {
  const items = feed([ev(1, "assistant.delta", { kind: "content", text: "x" })]);
  assert.deepEqual(applyEvent(items, ev(2, "notice", { text: "шум" })), items);
  assert.deepEqual(applyEvent(items, ev(3, "context.pressure", { approx: 1 })), items);
});

function msg(seq: number, fields: Partial<TranscriptMessage>): TranscriptMessage {
  return { seq, ts: 0, role: "assistant", content: null, ...fields };
}

test("промежуточный текст виден, а тулы и рассуждение свёрнуты", () => {
  const msgs: TranscriptMessage[] = [
    { seq: 1, ts: 0, role: "user", content: "сделай" },
    msg(2, {
      content: "начинаю",
      reasoning: "подумал",
      tool_calls: [{ id: "c1", type: "function", function: { name: "echo-one", arguments: "{}" } }],
    }),
    msg(3, { content: "конец" }),
  ];
  const tools = collectTools(msgs, [], true);
  const blocks = buildBlocks(msgs, tools);

  // you, пачка(рассуждение), текст шага, пачка(его тул), финальный текст.
  // Рассуждение идёт ДО текста, вызов — ПОСЛЕ него: так было в реальном ходе.
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["user", "fold", "say", "fold", "say"],
  );
  const reasoning = blocks[1];
  assert.equal(reasoning.kind, "fold");
  if (reasoning.kind === "fold") {
    assert.deepEqual(
      reasoning.parts.map((p) => p.kind),
      ["msg"],
    );
  }
  const calls = blocks[3];
  assert.equal(calls.kind, "fold");
  if (calls.kind === "fold") {
    assert.deepEqual(
      calls.parts.map((p) => p.kind),
      ["tool"],
    );
  }
});

test("вызов инструмента попадает в пачку, даже если у шага есть текст", () => {
  const msgs: TranscriptMessage[] = [
    { seq: 1, ts: 0, role: "user", content: "q" },
    msg(2, {
      content: "делаю",
      tool_calls: [{ id: "c1", type: "function", function: { name: "run", arguments: "{}" } }],
    }),
    msg(3, { content: "готово" }),
  ];
  const blocks = buildBlocks(msgs, collectTools(msgs, [], true));
  // Текст шага — отдельный видимый блок, его тул — в пачке ПОСЛЕ него.
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["user", "say", "fold", "say"],
  );
});

test("результаты тулов не становятся шагами, даже если в них markdown", () => {
  const msgs: TranscriptMessage[] = [
    { seq: 1, ts: 0, role: "user", content: "q" },
    msg(2, {
      tool_calls: [{ id: "c1", type: "function", function: { name: "fetch", arguments: "{}" } }],
    }),
    {
      seq: 3,
      ts: 0,
      role: "tool",
      content: "![картинка](http://пример/х.png)",
      name: "fetch",
      tool_call_id: "c1",
      exit: 0,
    },
    msg(4, { content: "итог" }),
  ];
  const blocks = buildBlocks(msgs, collectTools(msgs, [], true));
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["user", "fold", "say"],
  );
});

test("живой тул перекрывает журнальный по call_id", () => {
  const msgs: TranscriptMessage[] = [
    msg(1, {
      tool_calls: [{ id: "c1", type: "function", function: { name: "run", arguments: "{}" } }],
    }),
  ];
  const live = feed([ev(1, "tool.started", { call_id: "c1", name: "run", args: "{}" })]);
  const tools = collectTools(msgs, live, true);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].state, "running");
});
