/**
 * Настройки клиента: то, что человек настраивает под себя, а не код.
 *
 * Хранится в localStorage (одна машина, один браузер — как тема), а не в
 * конфиге ядра: это вкус к отображению, и он не должен переезжать вместе с
 * инстансом на другой хост.
 */

const KEY = "snens-settings";

export type Accent = "mint" | "lilac" | "acid" | "red";
export type HeadFont = "geist" | "akt" | "lack" | "obligat";
export type FieldForm = "auto" | "wave" | "clouds" | "casey" | "rays" | "dunes";

export interface Settings {
  /**
   * Показывать справку долгой памяти перед ходом, который её получил.
   * По умолчанию выключено: это служебный контекст промпта, и в обычном чтении
   * он только шумит. Кому важно видеть, «что агент вспомнил», — включает.
   */
  showRecall: boolean;
  /** Один акцентный цвет на весь интерфейс. */
  accent: Accent;
  /** Шрифт заголовков и логотипа. */
  head: HeadFont;
  /** Форма дизера на первом экране; «auto» меняется с каждым показом. */
  form: FieldForm;
}

const DEFAULTS: Settings = { showRecall: false, accent: "mint", head: "geist", form: "auto" };
const ACCENTS: Accent[] = ["mint", "lilac", "acid", "red"];
const HEADS: HeadFont[] = ["geist", "akt", "lack", "obligat"];
const FORMS: FieldForm[] = ["auto", "wave", "clouds", "casey", "rays", "dunes"];

function pick<T extends string>(v: unknown, list: T[], def: T): T {
  return typeof v === "string" && (list as string[]).includes(v) ? (v as T) : def;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      showRecall: Boolean(v.showRecall),
      accent: pick(v.accent, ACCENTS, DEFAULTS.accent),
      head: pick(v.head, HEADS, DEFAULTS.head),
      form: pick(v.form, FORMS, DEFAULTS.form),
    };
  } catch {
    // Битый/чужой JSON в localStorage — не повод падать: берём дефолты.
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Акцент и шрифт заголовков — атрибутами на корне, их читает CSS. */
export function applyLook(s: Settings) {
  document.documentElement.dataset.accent = s.accent;
  document.documentElement.dataset.head = s.head;
}

export function initialSettings(): Settings {
  // ?recall=1 — разовый показ для скриншота/отладки, в localStorage не оседает.
  const base = loadSettings();
  const q = new URLSearchParams(location.search).get("recall");
  if (q === "1") return { ...base, showRecall: true };
  if (q === "0") return { ...base, showRecall: false };
  return base;
}
