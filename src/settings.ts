/**
 * Настройки клиента: то, что человек настраивает под себя, а не код.
 *
 * Хранится в localStorage (одна машина, один браузер — как тема), а не в
 * конфиге ядра: это вкус к отображению, и он не должен переезжать вместе с
 * инстансом на другой хост.
 */

const KEY = "snens-settings";

export interface Settings {
  /**
   * Показывать справку долгой памяти перед ходом, который её получил.
   * По умолчанию выключено: это служебный контекст промпта, и в обычном чтении
   * он только шумит. Кому важно видеть, «что агент вспомнил», — включает.
   */
  showRecall: boolean;
}

const DEFAULTS: Settings = { showRecall: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Settings>;
    return { showRecall: Boolean(v.showRecall) };
  } catch {
    // Битый/чужой JSON в localStorage — не повод падать: берём дефолты.
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function initialSettings(): Settings {
  // ?recall=1 — разовый показ для скриншота/отладки, в localStorage не оседает.
  const q = new URLSearchParams(location.search).get("recall");
  if (q === "1") return { showRecall: true };
  if (q === "0") return { showRecall: false };
  return loadSettings();
}
