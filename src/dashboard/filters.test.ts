/**
 * Тесты правил дашборда: корзины hits, окно даты, «open/closed», сортировка,
 * разбор URL. Логика чистая, поэтому проверяется без React и без DOM.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyFilters,
  DEFAULT_FILTERS,
  dateMatch,
  distinct,
  filtersFromQuery,
  filtersToQuery,
  hitsMatch,
  isOpen,
  nextSort,
  sortTickets,
  textMatch,
  weightNum,
  type Filters,
  type Ticket,
} from "./filters.ts";

const NOW = 1_700_000_000; // фиксированное «сейчас» для окна даты

function ticket(over: Partial<Ticket> & { name: string }): Ticket {
  return {
    status: "open",
    kind: "bug",
    target: "run",
    family: "",
    weight: "1",
    hits: 1,
    symptom: "поле не растёт",
    mtime: NOW,
    ...over,
  };
}

const TICKETS: Ticket[] = [
  ticket({ name: "2026-01-01-a", hits: 3, weight: "2", mtime: NOW - 86400 * 2 }),
  ticket({ name: "2026-01-02-b", hits: 0, weight: "10", mtime: NOW - 86400 * 40, status: "done" }),
  ticket({ name: "2026-01-03-c", hits: 1, weight: "1", mtime: NOW - 86400 * 10, symptom: "другое" }),
];

const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });

test("isOpen: всё, кроме явно закрытых состояний", () => {
  assert.equal(isOpen("open"), true);
  assert.equal(isOpen("wip"), true);
  assert.equal(isOpen("done"), false);
  assert.equal(isOpen("closed"), false);
  assert.equal(isOpen("DONE"), false);
});

test("weightNum берёт первое число, мусор — 0", () => {
  assert.equal(weightNum("2"), 2);
  assert.equal(weightNum("2/3"), 2);
  assert.equal(weightNum(""), 0);
  assert.equal(weightNum("много"), 0);
});

test("корзины hits", () => {
  assert.equal(hitsMatch(0, "0"), true);
  assert.equal(hitsMatch(0, "1"), false);
  assert.equal(hitsMatch(2, "2+"), true);
  assert.equal(hitsMatch(3, "3+"), true);
  assert.equal(hitsMatch(2, "3+"), false);
  assert.equal(hitsMatch(0, "all"), true);
});

test("окно даты: 7/30 дней и «всё»", () => {
  assert.equal(dateMatch(NOW - 86400 * 2, "7", NOW), true);
  assert.equal(dateMatch(NOW - 86400 * 10, "7", NOW), false);
  assert.equal(dateMatch(NOW - 86400 * 10, "30", NOW), true);
  assert.equal(dateMatch(NOW - 86400 * 40, "30", NOW), false);
  assert.equal(dateMatch(NOW - 86400 * 40, "all", NOW), true);
});

test("поиск по name+symptom, регистр не важен", () => {
  assert.equal(textMatch(TICKETS[0], "2026-01-01"), true);
  assert.equal(textMatch(TICKETS[0], "ПОЛЕ"), true);
  assert.equal(textMatch(TICKETS[0], "нет-такого"), false);
  assert.equal(textMatch(TICKETS[0], "   "), true);
});

test("фильтры складываются через AND", () => {
  assert.deepEqual(
    applyFilters(TICKETS, f({ status: "open" }), NOW).map((t) => t.name),
    ["2026-01-01-a", "2026-01-03-c"],
  );
  assert.deepEqual(
    applyFilters(TICKETS, f({ status: "closed" }), NOW).map((t) => t.name),
    ["2026-01-02-b"],
  );
  assert.deepEqual(
    applyFilters(TICKETS, f({ hits: "0" }), NOW).map((t) => t.name),
    ["2026-01-02-b"],
  );
  assert.deepEqual(
    applyFilters(TICKETS, f({ date: "7" }), NOW).map((t) => t.name),
    ["2026-01-01-a"],
  );
});

test("сортировка: дата/hits/weight/name в обе стороны", () => {
  const byDate = sortTickets(TICKETS, "date", "desc").map((t) => t.name);
  assert.deepEqual(byDate, ["2026-01-01-a", "2026-01-03-c", "2026-01-02-b"]);

  const byHits = sortTickets(TICKETS, "hits", "asc").map((t) => t.hits);
  assert.deepEqual(byHits, [0, 1, 3]);

  // weight «10» больше «2» — сравнение числовое, а не строковое
  const byWeight = sortTickets(TICKETS, "weight", "desc").map((t) => weightNum(t.weight));
  assert.deepEqual(byWeight, [10, 2, 1]);

  const byName = sortTickets(TICKETS, "name", "asc").map((t) => t.name);
  assert.deepEqual(byName, ["2026-01-01-a", "2026-01-02-b", "2026-01-03-c"]);
});

test("сортировка не мутирует вход", () => {
  const copy = TICKETS.slice();
  sortTickets(TICKETS, "hits", "asc");
  assert.deepEqual(TICKETS, copy);
});

test("nextSort: новый ключ — desc, повторный клик — разворот", () => {
  assert.deepEqual(nextSort(f({ sort: "date", dir: "desc" }), "hits"), { sort: "hits", dir: "desc" });
  assert.deepEqual(nextSort(f({ sort: "hits", dir: "desc" }), "hits"), { sort: "hits", dir: "asc" });
  // имя начинается с A→Я: «сначала побольше» для строк смысла не имеет
  assert.deepEqual(nextSort(f({ sort: "date", dir: "desc" }), "name"), { sort: "name", dir: "asc" });
});

test("фильтры переживают круг через URL", () => {
  const src = f({ query: "поле", status: "closed", kind: "bug", hits: "2+", weight: "3", date: "30", sort: "hits", dir: "asc" });
  const q = filtersToQuery(src, new URLSearchParams("dash=tickets&session=abc"));
  // чужие параметры (?dash, ?session) не теряются: ссылка ведёт в тот же вид
  assert.equal(q.get("dash"), "tickets");
  assert.equal(q.get("session"), "abc");
  assert.deepEqual(filtersFromQuery(q), src);
});

test("дефолты в URL не пишутся; мусор в URL даёт дефолт", () => {
  const q = filtersToQuery(DEFAULT_FILTERS, new URLSearchParams());
  assert.equal(q.toString(), "");
  const bad = filtersFromQuery(new URLSearchParams("status=zzz&hits=9&date=500&sort=oops&dir=side"));
  assert.deepEqual(bad, DEFAULT_FILTERS);
});

test("distinct для выпадающих фильтров", () => {
  assert.deepEqual(distinct(TICKETS, "weight"), ["1", "2", "10"]); // числом, не строкой
  assert.deepEqual(distinct(TICKETS, "kind"), ["bug"]);
});
