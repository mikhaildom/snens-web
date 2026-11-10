import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../ui/icons";
import {
  activateBlocker,
  draftFromEdit,
  draftFromPreset,
  freeName,
  isEmptyDraft,
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
      onError("Имя профиля пустое");
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
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (stale) {
    return <p className="set-note">Ядро старее клиента, профилей в нём нет. Обнови ядро и перезагрузи страницу.</p>;
  }
  if (!v) return <p className="set-note">Загрузка…</p>;

  const fields = (p?: ProviderInfo) => (
    <>
      {!p && (
        <label className="field-row">
          <span>Название</span>
          <input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
      )}
      <label className="field-row">
        <span>Адрес API</span>
        <input
          placeholder="https://…/v1"
          {...(p ? { defaultValue: p.base_url } : { value: form.base_url ?? "" })}
          onChange={(e) => setForm({ ...form, base_url: e.target.value })}
        />
      </label>
      <label className="field-row">
        <span>Модель</span>
        <input
          placeholder="vendor/model"
          {...(p ? { defaultValue: p.model } : { value: form.model ?? "" })}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
      </label>
      <label className="field-row">
        <span>Ключ</span>
        <input
          type="password"
          autoComplete="off"
          placeholder={p ? (p.key_set ? "Задан. Оставь пустым, чтобы не менять" : "Не задан") : "Сохранится в .env рядом с конфигом"}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
        />
      </label>
      <div className="prov-acts">
        <button className="pbtn" type="submit" disabled={busy}>
          {p ? "Сохранить" : "Создать"}
        </button>
        <button className="gbtn" type="button" disabled={busy} onClick={() => setEditing(null)}>
          Отмена
        </button>
      </div>
    </>
  );

  return (
    <div className="provs" aria-busy={busy}>
      {v.providers.map((p) => {
        const blockA = activateBlocker(p);
        const blockR = removeBlocker(p);
        return (
          <div key={p.name} className="prov-card" data-on={p.active}>
            <div className="prov">
              <button
                className="prov-pick"
                disabled={blockA !== null || busy}
                title={blockA ? cap(blockA) : "Сделать активным"}
                aria-pressed={p.active}
                onClick={() => run(() => api.activateProvider(p.name))}
              >
                <span className="radio" />
                <span>
                  <b>{p.name}</b>
                  <small title={p.base_url}>{p.base_url || "адрес не задан"}</small>
                  <small>{p.model || "модель не задана"}</small>
                </span>
              </button>
              <span className="prov-state">
                {p.active ? "активен" : ""}
                <span data-set={p.key_set}>{p.key_set ? "ключ задан" : `нет ключа: ${p.key_env}`}</span>
              </span>
              <span className="prov-btns">
                <button
                  className="ibtn"
                  disabled={busy}
                  title="Изменить"
                  aria-label="Изменить профиль"
                  onClick={() => (editing === p.name ? setEditing(null) : startEdit(p))}
                >
                  <Icon name="settings" />
                </button>
                <button
                  className="ibtn"
                  disabled={blockR !== null || busy}
                  title={blockR ? cap(blockR) : "Удалить"}
                  aria-label="Удалить профиль"
                  onClick={() => run(() => api.removeProvider(p.name))}
                >
                  <Icon name="trash" />
                </button>
              </span>
            </div>
            {editing === p.name && (
              <form
                className="prov-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                {fields(p)}
              </form>
            )}
          </div>
        );
      })}

      {editing === "+" ? (
        <form
          className="prov-form prov-card"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {fields()}
        </form>
      ) : (
        <div className="prov-acts">
          <button className="gbtn" disabled={busy} onClick={() => startCreate()}>
            Добавить провайдера
          </button>
          {/* Пресеты подставляют адрес и модель, но не ключ: чужого секрета у клиента нет. */}
          {v.presets.map((preset) => (
            <button key={preset.name} className="gbtn" disabled={busy} title={`${preset.base_url}, ${preset.model}`} onClick={() => startCreate(preset)}>
              Добавить {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
