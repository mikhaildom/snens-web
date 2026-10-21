/**
 * Подпись медиа-вызова в ленте. Регрессия, из-за которой `shot` выглядел как
 * простыня JSON: у него нет `args.path` и нет `args.args`, путь появляется
 * только в выводе или во вложениях.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { argLabel, mediaPaths } from "./tool.ts";
import type { ToolRun } from "../lenta.ts";

const base: ToolRun = {
  callId: "c",
  name: "shot",
  state: "ok",
  exit: 0,
  args: "",
  preview: "",
};

test("shot: подпись — имя файла, а не argv", () => {
  const t: ToolRun = {
    ...base,
    args: JSON.stringify({ url: "http://x/", size: "1440x900" }),
    parts: [{ kind: "image", path: "/s/attach/call_1/a.png", mime: "image/png", bytes: 1 }],
  };
  assert.equal(argLabel(t), "a.png");
  assert.deepEqual(mediaPaths(t), ["/s/attach/call_1/a.png"]);
});

test("shot без вложений: путь берётся из вывода", () => {
  const t: ToolRun = {
    ...base,
    args: JSON.stringify({ url: "http://x/" }),
    preview: "/tmp/refac/a.png: image/png 1440x900 100 Б → вложение a.png",
  };
  assert.deepEqual(mediaPaths(t), ["/tmp/refac/a.png"]);
  assert.equal(argLabel(t), "a.png");
});

test("run остаётся с командой в подписи", () => {
  const t: ToolRun = {
    ...base,
    name: "run",
    args: JSON.stringify({ command: "ls -la /tmp" }),
    preview: "total 0",
  };
  assert.equal(argLabel(t), "ls -la /tmp");
  assert.deepEqual(mediaPaths(t), []);
});

test("многострочная команда в подписи — одной строкой", () => {
  const t: ToolRun = {
    ...base,
    name: "run",
    args: JSON.stringify({ command: "cd /tmp\nls -la" }),
    preview: "",
  };
  assert.equal(argLabel(t), "cd /tmp");
});
