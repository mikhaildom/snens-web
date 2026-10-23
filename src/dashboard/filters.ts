/**
 * Дашборд: типы и чистые функции фильтрации/сортировки.
 *
 * Никакого React: правила отбора — это то, что чаще всего ломается, и
 * проверять их надо тестом (`filters.test.ts`), а не глазами на скриншоте.
 * Состояние фильтров — обычный объект, который `Dashboard` держит зеркалом
 * URL-параметров: ссылка должна открывать тот же вид.
 */

/** Карточка тикета, как её отдаёт `GET /v1/tickets`. */
export interface Ticket {
  name: string;
  status: string;
  kind: string;
  target: string;
  family: string;
  /** Вес — строкой: ядро не гарантирует число (бывает «2/3»), сортируем числа. */
  weight: string;
  hits: number;
  symptom: string;
  /** mtime файла, unix сек. */
  mtime: number;
}

/** Полное тело тикета: `GET /v1/tickets/{name}`. */
export interface TicketBody {
  name: string;
  body: string;
}

/** Карточка ревью, как её отдаёт `GET /v1/reviews`. */
export interface Review {
  id: string;
  session: string;
  ts: number;
  status: "ok" | "error" | "running";
  summary: string;
}

export type StatusFilter = "all" | "open" | "closed";
export type HitsFilter = "all" | "0" | "1" | "2+" | "3+";
export type DateFilter = "all" | "7" | "30";
export type SortKey = "date" | "hits" | "weight" | "name";
export type SortDir = "asc" | "desc";

export interface Filters {
  query: string;
  status: StatusFilter;
  /** Пустая строка — «любой». */
  kind: string;
  hits: HitsFilter;
  weight: string;
  date: DateFilter;
  sort: SortKey;
  dir: SortDir;
}

/**
 * Порядок по умолчанию — как отдаёт ядро: свежие сверху. Разворачивать его
 * должен только явный клик по сортировке, иначе первый экран выглядит не так,
 * как ожидает человек, привыкший к ленте.
 */
export const DEFAULT_FILTERS: Filters = {
  query: "",
  status: "all",
  kind: "",
  hits: "all",
  weight: "",
  date: "all",
  sort: "date",
  dir: "desc",
};

// --- счётчики ---------------------------------------------------------------

/**
 * «open» — всё, что не закрыто. Ядро пишет `status: open|done|wip|...`, и
 * перечислять все закрытые значения в клиенте нельзя: новое состояние в ядре
 * не должно требовать правки веба. Достаточно одного признака «закрыт».
 */
export function isOpen(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s !== "closed" && s !== "done" && s !== "resolved" && s !== "wontfix";
}

/** Вес числом для сортировки; «2/3» и мусор — по первому числу. */
export function weightNum(weight: string): number {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(weight ?? ""));
  if (!m) return 0;
  return Number(m[0].replace(",", "."));
}

/** Попадает ли hits в выбранную корзину. */
export function hitsMatch(hits: number, f: HitsFilter): boolean {
  switch (f) {
    case "0":
      return hits === 0;
    case "1":
      return hits === 1;
    case "2+":
      return hits >= 2;
    case "3+":
      return hits >= 3;
    default:
      return true;
  }
}

/** Попадает ли дата в окно «последние N дней»; `now` — секунды, для теста. */
export function dateMatch(mtime: number, f: DateFilter, now = Date.now() / 1000): boolean {
  if (f === "all") return true;
  const days = Number(f);
  if (!Number.isFinite(days) || days <= 0) return true;
  return now - mtime <= days * 86400;
}

/** Подстрочный поиск: name + symptom, регистр не важен. Пустой запрос — всё. */
export function textMatch(t: Ticket, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${t.name}\n${t.symptom}`.toLowerCase().includes(q);
}

// --- фильтр и сортировка -----------------------------------------------------

/** Отобрать тикеты по всем фильтрам сразу (AND). */
export function applyFilters(
  tickets: Ticket[],
  f: Filters,
  now = Date.now() / 1000,
): Ticket[] {
  return sortTickets(
    tickets.filter(
      (t) =>
        textMatch(t, f.query) &&
        (f.status === "all" || (f.status === "open" ? isOpen(t.status) : !isOpen(t.status))) &&
        (!f.kind || t.kind === f.kind) &&
        (!f.weight || weightNum(t.weight) === weightNum(f.weight)) &&
        hitsMatch(t.hits, f.hits) &&
        dateMatch(t.mtime, f.date, now),
    ),
    f.sort,
    f.dir,
  );
}

/**
 * Сортировка. Сравнение по строке — локалью `ru` с числами: имена тикетов
 * начинаются с даты, и без `numeric` «10» встало бы перед «9». При равенстве
 * ключа порядок добивается по name — иначе при переключении направления
 * равные элементы прыгали бы местами без причины.
 */
export function sortTickets(tickets: Ticket[], key: SortKey, dir: SortDir): Ticket[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmpName = (a: Ticket, b: Ticket) => a.name.localeCompare(b.name, "ru");
  const cmp = (a: Ticket, b: Ticket): number => {
    switch (key) {
      case "hits":
        return (a.hits - b.hits) * sign || cmpName(a, b);
      case "weight":
        return (weightNum(a.weight) - weightNum(b.weight)) * sign || cmpName(a, b);
      case "name":
        return cmpName(a, b) * sign;
      default:
        return (a.mtime - b.mtime) * sign || cmpName(a, b);
    }
  };
  // slice: входной массив приходит из состояния React, его нельзя мутировать
  return tickets.slice().sort(cmp);
}

/**
 * Клик по уже выбранному ключу переворачивает направление; новый ключ
 * начинает с «сначала больше/свежее» для чисел и с A→Я для имени — так первое
 * нажатие даёт полезный ответ, а не пустую противоположность.
 */
export function nextSort(f: Filters, key: SortKey): Pick<Filters, "sort" | "dir"> {
  if (f.sort === key) return { sort: key, dir: f.dir === "asc" ? "desc" : "asc" };
  return { sort: key, dir: key === "name" ? "asc" : "desc" };
}

// --- URL --------------------------------------------------------------------

/**
 * Фильтры ⇄ query-строка. Дефолты в URL не пишем: чистая ссылка должна
 * оставаться короткой, а «?dash=1» — таким же, как из шапки.
 */
export function filtersToQuery(f: Filters, base: URLSearchParams): URLSearchParams {
  const q = new URLSearchParams(base);
  const set = (k: string, v: string, def: string) => {
    if (v && v !== def) q.set(k, v);
    else q.delete(k);
  };
  set("q", f.query.trim(), "");
  set("status", f.status, DEFAULT_FILTERS.status);
  set("kind", f.kind, "");
  set("hits", f.hits, DEFAULT_FILTERS.hits);
  set("weight", f.weight, "");
  set("date", f.date, DEFAULT_FILTERS.date);
  set("sort", f.sort, DEFAULT_FILTERS.sort);
  set("dir", f.dir, DEFAULT_FILTERS.dir);
  return q;
}

/** Прочитать фильтры из query. Мусор и чужие значения — дефолт, не исключение. */
export function filtersFromQuery(q: URLSearchParams): Filters {
  const one = <T extends string>(k: string, allowed: readonly T[], def: T): T => {
    const v = q.get(k);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : def;
  };
  return {
    query: q.get("q") ?? "",
    status: one("status", ["all", "open", "closed"] as const, DEFAULT_FILTERS.status),
    kind: q.get("kind") ?? "",
    hits: one("hits", ["all", "0", "1", "2+", "3+"] as const, DEFAULT_FILTERS.hits),
    weight: q.get("weight") ?? "",
    date: one("date", ["all", "7", "30"] as const, DEFAULT_FILTERS.date),
    sort: one("sort", ["date", "hits", "weight", "name"] as const, DEFAULT_FILTERS.sort),
    dir: one("dir", ["asc", "desc"] as const, DEFAULT_FILTERS.dir),
  };
}

/** Уникальные значения поля по всем тикетам — для выпадающих фильтров. */
export function distinct(tickets: Ticket[], field: "kind" | "weight"): string[] {
  const set = new Set<string>();
  for (const t of tickets) {
    const v = String(t[field] ?? "").trim();
    if (v) set.add(v);
  }
  // Вес сортируем числом: строки «2» и «10» в выпадающем списке иначе врут.
  return [...set].sort((a, b) =>
    field === "weight" ? weightNum(a) - weightNum(b) || a.localeCompare(b, "ru") : a.localeCompare(b, "ru"),
  );
}
