import { useEffect, useState } from "react";
import { api, type ConfigPatch, type InstanceConfig } from "../api";

/**
 * Настройки инстанса: то, что живёт в конфиге ядра и меняется без рестарта
 * сервиса (`GET/PUT /v1/config`). Ядро перечитывает файл на каждом ходу, поэтому
 * правка действует со следующего хода той сессии, где он начнётся.
 *
 * Состояние держим здесь, а не в App: настройки нужны только этому блоку, а
 * «показать ошибку» приходит пропсом — как у остальных экранов.
 */
export function InstanceSettings({
  onError,
}: {
  onError: (e: string) => void;
}) {
  const [cfg, setCfg] = useState<InstanceConfig | null>(null);
  /** Ядро старше маршрута `/v1/config` — показываем это, а не ошибку 404. */
  const [stale, setStale] = useState(false);
  /** Что уже отправлено, но ещё не подтверждено: поле не дёргается под рукой. */
  const [busy, setBusy] = useState(false);

  // Панель настроек уже открыта — значит и конфиг нужен сразу: отдельного
  // раскрытия у этого блока больше нет (он раздел общего меню).
  useEffect(() => {
    if (cfg || stale) return;
    api
      .config()
      .then(setCfg)
      // Клиент обновляется отдельно от ядра (это два сервиса), и между их
      // рестартами маршрута может ещё не быть. 404 — не поломка настроек, а
      // «ядро старее»: говорим это прямо, а не пугаем ошибкой.
      .catch((e) => {
        const msg = String(e instanceof Error ? e.message : e);
        if (msg.includes("not_found") || msg.includes("404")) setStale(true);
        else onError(msg);
      });
  }, [cfg, stale, onError]);

  /** Одна правка — один PUT: ответ уже содержит актуальные значения. */
  async function patch(p: ConfigPatch) {
    setBusy(true);
    try {
      setCfg(await api.putConfig(p));
    } catch (e) {
      onError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  const v = cfg?.values;

  return (
    <div className="inst__body" aria-busy={busy}>
      {stale ? (
        <div className="inst__hint">
          ядро старее клиента: настроек нет. Обнови ядро и перезагрузи страницу
        </div>
      ) : !v ? (
        <div className="inst__hint">загрузка…</div>
      ) : (
        <>
          <label className="inst__row">
            <span>провайдер</span>
            <input
              className="inst__text"
              readOnly
              value={v.active_provider || "(ключи конфига)"}
              title={v.base_url || v.model}
            />
          </label>

          <label className="inst__row">
            <span>модель</span>
            <input
              className="inst__text"
              defaultValue={v.model}
              // Модель активного провайдера живёт в его профиле: правка этого
              // поля легла бы в top-level и была бы молча перекрыта профилем —
              // человек «поменял модель», а ход ушёл старой.
              disabled={Boolean(v.active_provider)}
              title={
                v.active_provider
                  ? `модель берётся из профиля «${v.active_provider}»`
                  : v.model
              }
              onBlur={(e) => {
                const m = e.target.value.trim();
                if (m && m !== v.model) patch({ model: m });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>

          <label className="inst__row">
            <span>модель подагентов</span>
            <input
              className="inst__text"
              defaultValue={v.subagent_model}
              placeholder="как основная"
              title={v.subagent_model}
              onBlur={(e) => {
                const m = e.target.value.trim();
                if (m !== v.subagent_model) patch({ subagent_model: m });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>

          <label className="inst__check">
            <input
              type="checkbox"
              checked={v.max_turns === 0}
              disabled={busy}
              onChange={(e) => patch({ max_turns: e.target.checked ? 0 : 200 })}
            />
            <span>
              без лимита ходов
              <small>
                {v.max_turns === 0 ? "сейчас лимита нет" : `сейчас ${v.max_turns} ходов`}
              </small>
            </span>
          </label>

          <label className="inst__row">
            <span>ходов до ревью</span>
            <input
              className="inst__num"
              type="number"
              min={0}
              defaultValue={v.review_min_turns}
              disabled={busy}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n !== v.review_min_turns) {
                  patch({ review_min_turns: n });
                }
              }}
            />
          </label>

          <label className="inst__row">
            <span>секунд простоя до ревью</span>
            <input
              className="inst__num"
              type="number"
              min={0}
              defaultValue={v.review_idle_seconds}
              disabled={busy}
              title="0 — ревью не запускать"
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (
                  Number.isFinite(n) &&
                  n >= 0 &&
                  n !== v.review_idle_seconds
                ) {
                  patch({ review_idle_seconds: n });
                }
              }}
            />
          </label>

          <label className="inst__row">
            <span>таймаут `run`, с</span>
            <input
              className="inst__num"
              type="number"
              min={1}
              defaultValue={v.timeout_seconds}
              disabled={busy}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1 && n !== v.timeout_seconds) {
                  patch({ timeout_seconds: n });
                }
              }}
            />
          </label>

          <div className="inst__row">
            <span>память</span>
            <div className="inst__group">
              <button
                aria-pressed={v.memory_enabled}
                disabled={busy}
                onClick={() => patch({ memory_enabled: !v.memory_enabled })}
              >
                {v.memory_enabled ? "вкл" : "выкл"}
              </button>
              <button
                aria-pressed={v.memory_recall === "always"}
                disabled={busy || !v.memory_enabled}
                title="справка на каждый ход"
                onClick={() =>
                  patch({
                    memory_recall:
                      v.memory_recall === "always" ? "off" : "always",
                  })
                }
              >
                справка
              </button>
              <button
                aria-pressed={v.memory_retain}
                disabled={busy || !v.memory_enabled}
                title="записывать каждый ход в память"
                onClick={() => patch({ memory_retain: !v.memory_retain })}
              >
                запись
              </button>
            </div>
          </div>

          <label className="inst__check">
            <input
              type="checkbox"
              checked={v.reduce_output}
              disabled={busy}
              onChange={(e) => patch({ reduce_output: e.target.checked })}
            />
            <span>
              сокращать вывод команд
              <small>чистить вывод команд перед отправкой модели</small>
            </span>
          </label>

          <label className="inst__check">
            <input
              type="checkbox"
              checked={v.attachments}
              disabled={busy}
              onChange={(e) => patch({ attachments: e.target.checked })}
            />
            <span>
              вложения
              <small>картинки и файлы уезжают модели</small>
            </span>
          </label>

          {v.active_provider ? (
            <div className="inst__hint">
              модель и адрес задаёт профиль «{v.active_provider}» — раздел
              «провайдеры» выше
            </div>
          ) : null}

          <div className="inst__hint" title={cfg.path}>
            конфиг: {cfg.path.split("/").pop()}
          </div>
        </>
      )}
    </div>
  );
}
