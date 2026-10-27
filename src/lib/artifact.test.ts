/**
 * Тесты разбора фенсов `artifact`.
 *
 * Проверяем не «примерно так выглядит», а свойства, из-за которых лента ломается:
 *  1. обычный код (` ```html `) остаётся кодом — регресс всего markdown;
 *  2. незакрытый фенс — это артефакт в работе, а не кусок HTML текстом;
 *  3. повтор `id` = правка, а не второй блок и не прыжок вниз;
 *  4. приватные адреса не попадают в CSP, даже если модель их попросила.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowedNets,
  artifactCsp,
  connectSrc,
  isPrivateHost,
  latestArtifacts,
  parseHead,
  splitArtifacts,
} from "./artifact.ts";

const fence = (head: string, body: string, ticks = "```") => `${ticks}artifact ${head}\n${body}\n${ticks}`;

test("обычный код-фенс остаётся текстом", () => {
  const src = "до\n```html\n<b>hi</b>\n```\nпосле";
  const segs = splitArtifacts(src);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].kind, "text");
});

test("текст до и после артефакта сохраняется отдельными сегментами", () => {
  const segs = splitArtifacts(`до\n${fence("id=q", "<p>1</p>")}\nпосле`);
  assert.deepEqual(
    segs.map((s) => s.kind),
    ["text", "artifact", "text"],
  );
  assert.equal(segs[1].kind === "artifact" && segs[1].art.id, "q");
  assert.equal(segs[2].kind === "text" && segs[2].text.trim(), "после");
});

test("незакрытый фенс — артефакт в работе, а не текст", () => {
  const segs = splitArtifacts("```artifact id=quiz\n<div>печатаю…");
  assert.equal(segs.length, 1);
  const s = segs[0];
  assert.equal(s.kind, "artifact");
  assert.equal(s.kind === "artifact" && s.art.open, true);
  assert.equal(s.kind === "artifact" && s.art.body, "<div>печатаю…");
});

test("закрывающая строка обязана быть не короче открывающей", () => {
  const segs = splitArtifacts("````artifact id=a\n```\nкод внутри\n```\n````");
  assert.equal(segs.length, 1);
  const art = segs[0].kind === "artifact" && segs[0].art;
  assert.ok(art);
  assert.equal(art.open, false);
  assert.match(art.body, /```\nкод внутри\n```/);
});

test("повтор id — правка, позиция остаётся первой", () => {
  const segs = splitArtifacts(
    `a\n${fence("id=q", "<p>v1</p>")}\nb\n${fence("id=q", "<p>v2</p>")}\nc`,
  );
  const arts = latestArtifacts(segs).filter((s) => s.kind === "artifact");
  assert.equal(arts.length, 1, "ревизия не должна давать второй блок");
  const art = arts[0].kind === "artifact" && arts[0].art;
  assert.ok(art);
  assert.equal(art.rev, 2);
  assert.match(art.body, /v2/);
});

test("текст после артефакта не пропадает при сворачивании ревизий", () => {
  const segs = latestArtifacts(
    splitArtifacts(`до\n${fence("id=q", "<p>1</p>")}\nпосле\n${fence("id=q", "<p>2</p>")}\nконец`),
  );
  assert.deepEqual(
    segs.map((s) => s.kind),
    ["text", "artifact", "text", "text"],
  );
  const texts = segs.filter((s) => s.kind === "text").map((s) => (s.kind === "text" ? s.text.trim() : ""));
  assert.deepEqual(texts, ["до", "после", "конец"]);
});

test("без id артефакты получают позиционные имена, и они не совпадают", () => {
  const segs = latestArtifacts(splitArtifacts(`${fence("", "<p>1</p>")}\n${fence("", "<p>2</p>")}`));
  const ids = segs.map((s) => s.kind === "artifact" && s.art.id);
  assert.deepEqual(ids, ["#1", "#2"]);
});

test("заголовок разбирается, неизвестный ключ виден", () => {
  const { head, unknown } = parseHead("id=q net=api.example.com,cdn.example.com height=320");
  assert.equal(head.id, "q");
  assert.deepEqual(head.net, ["api.example.com", "cdn.example.com"]);
  assert.equal(head.height, 320);
  assert.deepEqual(unknown, []);
  const bad = parseHead("id=q nt=api.example.com");
  assert.deepEqual(bad.unknown, ["nt"]);
});

test("мусор в id и высоте не ломает разбор", () => {
  const { head } = parseHead('id=<script> height=99999');
  assert.equal(head.id, "");
  assert.equal(head.height, 0);
});

test("приватная сеть не попадает в CSP", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.10",
    "172.20.0.1",
    "169.254.1.1",
    "printer.local",
    "::1",
  ]) {
    assert.equal(isPrivateHost(host), true, host);
  }
  assert.equal(isPrivateHost("api.example.com"), false);
  assert.equal(isPrivateHost("172.32.0.1"), false, "172.32 уже не приватный диапазон");
  const { head } = parseHead("net=api.example.com,localhost,192.168.0.1");
  assert.deepEqual(allowedNets(head), ["api.example.com"]);
  assert.equal(connectSrc(head), "https://api.example.com");
});

test("без net= сеть запрещена целиком", () => {
  const { head } = parseHead("id=q");
  assert.equal(connectSrc(head), "'none'");
  assert.match(artifactCsp(head, true), /connect-src 'none'/);
});

test("скрипты выключаются в черновике", () => {
  const { head } = parseHead("id=q net=api.example.com");
  const draft = artifactCsp(head, false);
  assert.match(draft, /script-src 'none'/);
  const final = artifactCsp(head, true);
  assert.match(final, /script-src 'unsafe-inline' https:\/\/api\.example\.com/);
});

test("пустой заголовок не падает", () => {
  const segs = splitArtifacts("```artifact\n<p>1</p>\n```");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].kind === "artifact" && segs[0].art.id, "#1");
});
