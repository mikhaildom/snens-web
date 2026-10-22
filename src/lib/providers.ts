/**
 * Профили провайдеров LLM на клиенте: правила, которые нельзя проверить глазами.
 *
 * Ядро отдаёт список профилей и «что работает сейчас»; клиенту остаётся решить,
 * что показать человеку: где ключ не задан, можно ли удалить профиль, какое тело
 * отправить при создании из пресета. Всё это — чистые функции, поэтому проверяются
 * тестом (`providers.test.ts`), а не скриншотом.
 */

/** Профиль в том виде, в каком его отдаёт `GET /v1/providers` (без ключа). */
export interface ProviderInfo {
  name: string;
  base_url: string;
  model: string;
  /** Имя переменной окружения с ключом; значение не приходит никогда. */
  key_env: string;
  /** Ключ задан в окружении или `.env` — клиенту хватает признака. */
  key_set: boolean;
  active: boolean;
  /** У профиля есть и адрес, и модель; неполный нельзя активировать. */
  complete: boolean;
  /** Виртуальный профиль из top-level ключей: секции `[providers]` в конфиге нет. */
  implicit?: boolean;
}

export interface ProviderState {
  providers: ProviderInfo[];
  /** Имя активного профиля; null — живём на top-level ключах конфига. */
  active: string | null;
  /** Что ядро взяло бы для следующего хода (уже с учётом активного профиля). */
  effective: {
    base_url: string;
    model: string;
    key_env: string;
    key_set: boolean;
  };
  config: string | null;
  presets: Array<{ name: string; base_url: string; model: string }>;
}

/** Тело создания/правки. `key` уезжает в `.env`, пустой — «не менять». */
export interface ProviderDraft {
  name?: string;
  base_url?: string;
  model?: string;
  key?: string;
  activate?: boolean;
}

/** Почему профиль нельзя активировать: `null` — можно. */
export function activateBlocker(p: ProviderInfo): string | null {
  if (p.active) return "уже активен";
  if (!p.complete) return "нет модели или адреса";
  if (p.implicit) return "профиль из конфига: заведи свой, чтобы переключаться";
  return null;
}

/** Почему профиль нельзя удалить: активный держит ядро рабочим. */
export function removeBlocker(p: ProviderInfo): string | null {
  if (p.implicit) return "это ключи самого конфига, а не профиль";
  if (p.active) return "активный: сначала переключись на другой";
  return null;
}

/**
 * Подпись про ключ. Значение не показываем даже частично: панель открывают при
 * людях и на скриншотах, а хвост ключа — это уже утечка.
 */
export function keyLabel(p: ProviderInfo): string {
  return p.key_set ? "задан" : `не задан (${p.key_env})`;
}

/**
 * Что показать строкой состояния сверху списка: активный провайдер и адрес, по
 * которому ядро реально пойдёт. Человек переключает профиль и должен видеть
 * результат переключения, а не догадываться.
 */
export function effectiveLabel(state: ProviderState): string {
  const model = state.effective.model || "(модель не задана)";
  const host = hostOf(state.effective.base_url) || "(адрес не задан)";
  return `${host} · ${model}`;
}

/** Хост из base_url без схемы и хвоста — короткая подпись для узкой рельсы. */
export function hostOf(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

/**
 * Тело создания из пресета: адрес и модель из ядра, имя — из пресета, ключ пуст.
 * Пресет ключа не несёт — подставить чужой секрет нечем.
 */
export function draftFromPreset(
  preset: { name: string; base_url: string; model: string },
  name?: string,
): ProviderDraft {
  return {
    name: name?.trim() || preset.name,
    base_url: preset.base_url,
    model: preset.model,
  };
}

/**
 * Имя профиля, ещё не занятое. Ядро ответит 409, но предлагать человеку заведомо
 * занятое имя — это ошибка, которую видно до запроса.
 */
export function freeName(base: string, taken: string[], sep = "-"): string {
  const names = new Set(taken);
  const clean = base.trim() || "провайдер";
  if (!names.has(clean)) return clean;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${clean}${sep}${n}`;
    if (!names.has(candidate)) return candidate;
  }
  return clean;
}

/**
 * Правка профиля: только изменённые поля. Пустой ключ не отправляем — иначе
 * сохранение модели без ключа стёрло бы ключ из `.env`.
 */
export function draftFromEdit(
  before: ProviderInfo,
  after: { name?: string; base_url?: string; model?: string; key?: string },
): ProviderDraft {
  const draft: ProviderDraft = {};
  const base = after.base_url?.trim();
  const model = after.model?.trim();
  const key = after.key?.trim();
  // Хвостовой слэш ядро снимает само, поэтому «добавил `/`» — не правка:
  // иначе каждое сохранение без изменений давало бы запрос к `.env`.
  if (base !== undefined && base.replace(/\/+$/, "") !== before.base_url.replace(/\/+$/, "")) {
    draft.base_url = base;
  }
  if (model !== undefined && model !== before.model) draft.model = model;
  if (key) draft.key = key;
  return draft;
}

/** Пустая правка — не ошибка, но и запрос не нужен: PUT без полей ничего не меняет. */
export function isEmptyDraft(draft: ProviderDraft): boolean {
  return Object.values(draft).every((v) => v === undefined || v === "");
}
