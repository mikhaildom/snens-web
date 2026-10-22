import { useEffect, useState } from "react";
import { api } from "../api";
import {
  activateBlocker,
  draftFromEdit,
  draftFromPreset,
  effectiveLabel,
  freeName,
  isEmptyDraft,
  keyLabel,
  removeBlocker,
  type ProviderDraft,
  type ProviderInfo,
  type ProviderState,
} from "../lib/providers";

/**
 * Раздел «провайдеры» в настройках: список профилей, правка, переключение.
 *
 * Ключ — password-поле и только на ввод: ядро никогда не отдаёт значение назад
 * (в ответе лишь «задан»), поэтому показать «ключ целиком» тут нечем, и это
 * правильно — панель открывают и при людях. Пустое поле при сохранении значит
 * «оставь как есть», иначе правка модели стирала бы секрет.
 *
 * Состояние держим здесь: список нужен только этому разделу, а ошибки уходят
 * общим каналом `onError`, как у остальных экранов.
 */
export function ProviderSettings({
  onError,
  onChanged,
}: {
  onError: (e: string) => void;
  /** Активный провайдер сменился — родитель обновит «модель» в общей панели. */
  onChanged?: () => void;
}) {
  const [state, setState] = useState<ProviderState | null>(null);
  /** Ядро старше маршрута `/v1/providers` — говорим это, а не пугаем 404. */
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Имя профиля, который сейчас правят (или `+` — форма создания). */
  const [editing, setEditing] = useState<string | null>(null);
  /** Черновик формы: поля ввода и ключ отдельно (ключ не приходит с сервера). */
  const [form, setForm] = useState<ProviderDraft & { name: string }>({
    name: "",
  });

  useEffect(() => {
    if (state || stale) return;
    api
      .providers()
      .then(setState)
      .catch((e) => {
        const msg = String(e instanceof Error ? e.message : e);
        if (msg.includes("not_found") || msg.includes("404")) setStale(true);
        else onError(msg);
      });
  }, [state, stale, onError]);

  /** Один запрос — один новый список: ядро отвечает им же, локально не гадаем. */
  async function run(fn: () => Promise<ProviderState>) {
    setBusy(true);
    try {
      setState(await fn());
      setEditing(null);
      onChanged?.();
    } catch (e) {
      onError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  function startCreate(preset?: ProviderState["presets"][number]) {
    const taken = state?.providers.map((p) => p.name) ?? [];
    const base = preset
      ? draftFromPreset(preset, freeName(preset.name, taken))
      : { name: freeName("провайдер", taken) };
    setForm({ ...base, name: base.name ?? "" });
    setEditing("+");
  }

  function startEdit(p: ProviderInfo) {
    setForm({ name: p.name, base_url: p.base_url, model: p.model, key: "" });
    setEditing(p.name);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      onError("имя профиля пустое");
      return;
    }
    if (editing === "+") {
      // Новый профиль заводим неактивным: переключение — отдельное действие,
      // чтобы «добавил и сразу хожу им» не было неожиданностью.
      await run(() =>
        api.createProvider({
          name,
          base_url: form.base_url,
          model: form.model,
          key: form.key,
          activate: state?.providers.every((p) => p.implicit) ?? false,
        }),
      );
      return;
    }
    const before = state?.providers.find((p) => p.name === editing);
    if (!before) return;
    const draft = draftFromEdit(before, form);
    if (isEmptyDraft(draft)) {
      setEditing(null);
      return;
    }
    await run(() => api.updateProvider(before.name, draft));
  }

  const v = state;

  if (stale) {
    return (
      <div className="inst__hint">
        ядро не отдаёт /v1/providers — оно старше этого клиента. Профили
        появятся после его обновления.
      </div>
    );
  }
  if (!v) return <div className="inst__hint">загрузка…</div>;

  return (
    <div className="prov" aria-busy={busy}>
      <div className="inst__hint" title={v.config ?? ""}>
        работает: {effectiveLabel(v)}
      </div>

      <ul className="prov__list">
        {v.providers.map((p) => {
          const canActivate = activateBlocker(p) === null;
          const canRemove = removeBlocker(p) === null;
          return (
            <li
              key={p.name}
              className="prov__item"
              data-active={p.active}
              data-editing={editing === p.name}
            >
              <div className="prov__head">
                <button
                  className="prov__name"
                  disabled={!canActivate || busy}
                  title={activateBlocker(p) ?? "сделать активным"}
                  aria-pressed={p.active}
                  onClick={() => run(() => api.activateProvider(p.name))}
                >
                  {p.active ? "● " : "○ "}
                  {p.name}
                </button>
                <button
                  className="prov__pick"
                  disabled={busy}
                  title="изменить"
                  onClick={() => (editing === p.name ? setEditing(null) : startEdit(p))}
                >
                  ✎
                </button>
                <button
                  className="prov__pick"
                  disabled={!canRemove || busy}
                  title={removeBlocker(p) ?? "удалить"}
                  onClick={() => run(() => api.removeProvider(p.name))}
                >
                  ✕
                </button>
              </div>
              <div className="prov__meta" title={p.base_url}>
                {p.base_url} · {p.model}
              </div>
              <div className="prov__meta prov__key" data-set={p.key_set}>
                ключ: {keyLabel(p)}
              </div>

              {editing === p.name && (
                <form
                  className="prov__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                >
                  <label className="inst__row">
                    <span>base_url</span>
                    <input
                      className="inst__text"
                      defaultValue={p.base_url}
                      onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    />
                  </label>
                  <label className="inst__row">
                    <span>модель</span>
                    <input
                      className="inst__text"
                      defaultValue={p.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                    />
                  </label>
                  <label className="inst__row">
                    <span>ключ</span>
                    <input
                      className="inst__text"
                      type="password"
                      autoComplete="off"
                      placeholder={p.key_set ? "задан — оставь пустым" : "не задан"}
                      onChange={(e) => setForm({ ...form, key: e.target.value })}
                    />
                  </label>
                  <div className="inst__group">
                    <button type="submit" disabled={busy}>
                      сохранить
                    </button>
                    <button type="button" disabled={busy} onClick={() => setEditing(null)}>
                      отмена
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {editing === "+" ? (
        <form
          className="prov__form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="inst__row">
            <span>название</span>
            <input
              className="inst__text"
              value={form.name}
              autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="inst__row">
            <span>base_url</span>
            <input
              className="inst__text"
              placeholder="https://…/v1"
              value={form.base_url ?? ""}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            />
          </label>
          <label className="inst__row">
            <span>модель</span>
            <input
              className="inst__text"
              placeholder="vendor/model"
              value={form.model ?? ""}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </label>
          <label className="inst__row">
            <span>ключ</span>
            <input
              className="inst__text"
              type="password"
              autoComplete="off"
              placeholder="сохранится в .env рядом с конфигом"
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </label>
          <div className="inst__group">
            <button type="submit" disabled={busy}>
              создать
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(null)}>
              отмена
            </button>
          </div>
        </form>
      ) : (
        <div className="inst__group">
          <button disabled={busy} onClick={() => startCreate()}>
            + профиль
          </button>
          {/* Пресеты — те же два, что человек заводит в первую очередь. Адрес и
              модель подставляем, ключ — нет: чужого секрета у клиента нет. */}
          {v.presets.map((preset) => (
            <button
              key={preset.name}
              disabled={busy}
              title={`${preset.base_url} · ${preset.model}`}
              onClick={() => startCreate(preset)}
            >
              + {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
