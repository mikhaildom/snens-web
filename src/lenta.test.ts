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

import { applyEvent, buildBlocks, collectTools, liveSteps, type LiveItem } from "./lenta.ts";
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
  return items
    .filter((it) => it.kind !== "usage")
    .map((it) =>
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

test("стрим группируется в шаги так же, как история", () => {
  const items = feed([
    ev(1, "assistant.delta", { kind: "reasoning", text: "думаю" }),
    ev(2, "assistant.delta", { kind: "content", text: "делаю" }),
    ev(3, "tool.started", { call_id: "c1", name: "run", args: "{}" }),
    ev(4, "tool.completed", { call_id: "c1", exit: 0, preview: "ok", ms: 12 }),
    ev(5, "usage", { in_tok: 100, cached_tok: 80, out_tok: 10, reason_tok: 2, cost_micro: 3000 }),
    ev(6, "assistant.delta", { kind: "content", text: "готово" }),
  ]);
  const steps = liveSteps(items);
  // Два шага: работа с тулом и финальный текст. Внутри первого — рассуждение,
  // текст и тул в том же порядке, что даёт журнал.
  assert.equal(steps.length, 2);
  assert.equal(steps[0].reasoning, "думаю");
  assert.equal(steps[0].text, "делаю");
  assert.equal(steps[0].tools.length, 1);
  assert.equal(steps[0].tools[0].ms, 12);
  assert.equal(steps[0].usage?.cached_tok, 80);
  assert.equal(steps[1].text, "готово");
});

test("вложения и время тула приезжают из стрима, а не только из журнала", () => {
  const items = feed([
    ev(1, "tool.started", { call_id: "c1", name: "view", args: "{}" }),
    ev(2, "tool.completed", {
      call_id: "c1",
      exit: 0,
      ms: 40,
      parts: [{ kind: "image", path: "/tmp/a.png", mime: "image/png", bytes: 10 }],
    }),
  ]);
  const tool = items.find((it) => it.kind === "tool");
  assert.ok(tool && tool.kind === "tool");
  assert.equal(tool.tool.parts?.length, 1);
  assert.equal(tool.tool.ms, 40);
});

test("маркер ревью рвёт пачку и стоит отдельным блоком", () => {
  const msgs: TranscriptMessage[] = [
    { seq: 1, ts: 0, role: "user", content: "q" },
    msg(2, {
      tool_calls: [{ id: "c1", type: "function", function: { name: "run", arguments: "{}" } }],
    }),
    { seq: 3, ts: 0, role: "review", content: "саморевью · 12 ходов" },
    msg(4, { content: "итог" }),
  ];
  const blocks = buildBlocks(msgs, collectTools(msgs, [], true));
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["user", "fold", "review", "say"],
  );
});

test("расход приходит до тулов своего шага и не отрывает их", () => {
  // Порядок ядра: ответ модели → usage → вызовы этого же ответа.
  const items = feed([
    ev(1, "assistant.delta", { kind: "content", text: "сейчас выполню" }),
    ev(2, "usage", { in_tok: 100, cached_tok: 0, out_tok: 5, reason_tok: 0, cost_micro: 1000 }),
    ev(3, "tool.started", { call_id: "c1", name: "run", args: "{}" }),
    ev(4, "tool.completed", { call_id: "c1", exit: 0, ms: 5 }),
    ev(5, "assistant.delta", { kind: "content", text: "готово" }),
  ]);
  const steps = liveSteps(items);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].text, "сейчас выполню");
  assert.equal(steps[0].tools.length, 1, "вызов остался в шаге своего ответа");
  assert.equal(steps[0].usage?.in_tok, 100);
  assert.equal(steps[1].text, "готово");
});

test("расход промежуточного шага не пропадает, если текст ушёл в пачку", () => {
  const usage = { in_tok: 10, cached_tok: 5, out_tok: 2, reason_tok: 1, cost_micro: 7 };
  const msgs: TranscriptMessage[] = [
    { seq: 1, ts: 0, role: "user", content: "q" },
    // Шаг без текста: рассуждение + вызов, расход при нём.
    msg(2, {
      reasoning: "думаю",
      usage,
      tool_calls: [{ id: "c1", type: "function", function: { name: "run", arguments: "{}" } }],
    }),
  ];
  const blocks = buildBlocks(msgs, collectTools(msgs, [], true));
  const fold = blocks.find((b) => b.kind === "fold");
  assert.ok(fold && fold.kind === "fold");
  const part = fold.parts.find((p) => p.kind === "msg");
  assert.ok(part && part.kind === "msg");
  assert.deepEqual(part.m.usage, usage);
});
