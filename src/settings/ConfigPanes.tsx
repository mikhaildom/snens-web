import { useEffect, useState, type ReactNode } from "react";
import { api, type ConfigPatch, type InstanceConfig } from "../api";


/**
 * Конфиг ядра (`GET/PUT /v1/config`) для разделов настроек. Ядро перечитывает
 * файл на каждом ходу: правка действует со следующего хода, перезапуск не нужен.
 * Одна правка — один PUT, ответ уже содержит актуальные значения.
 */
export function useConfig(onError: (e: string) => void) {
  const [cfg, setCfg] = useState<InstanceConfig | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .config()
      .then((c) => alive && setCfg(c))
      .catch((e) => {
        if (!alive) return;
        const msg = String(e instanceof Error ? e.message : e);
        if (msg.includes("not_found") || msg.includes("404")) setStale(true);
        else onError(msg);
      });
    return () => {
      alive = false;
    };
  }, [onError]);
  async function patch(p: ConfigPatch) {
    setBusy(true);
    try {
      setCfg(await api.putConfig(p));
      setSaved(true);
    } catch (e) {
      onError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  return { cfg, v: cfg?.values ?? null, stale, busy, saved, patch };
}

export type ConfigApi = ReturnType<typeof useConfig>;

/** Строка настройки: название, ключ конфига, пояснение и управление справа. */
export function Row({
  title,
  k,
  desc,
  children,
  wide,
}: {
  title: string;
  k?: string;
  desc?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="cfg" data-wide={wide || undefined}>
      <div>
        <h4>
          {title} {k && <code>{k}</code>}
        </h4>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="cfg-c">{children}</div>}
    </div>
  );
}

/** Число: сохраняется по уходу из поля или Enter. */
export function Num({
  value,
  min = 0,
  unit,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  min?: number;
  unit?: string;
  label: string;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  return (
    <>
      <input
        key={value}
        type="number"
        min={min}
        aria-label={label}
        defaultValue={value}
        disabled={disabled}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {unit && <small>{unit}</small>}
    </>
  );
}

/** Текст: сохраняется по уходу из поля или Enter. */
export function Text({
  value,
  label,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (s: string) => void;
}) {
  return (
    <input
      key={value}
      className="cfg-text"
      aria-label={label}
      defaultValue={value}
      placeholder={placeholder}
      disabled={disabled}
      onBlur={(e) => {
        const s = e.target.value.trim();
        if (s !== value) onCommit(s);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export function Toggle({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-on={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
    />
  );
}

export function Seg<T extends string>({
  value,
  options,
  label,
  disabled,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  label: string;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg-c" role="group" aria-label={label}>
      {options.map(([k, t]) => (
        <button key={k} data-on={value === k} disabled={disabled} onClick={() => onChange(k)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function Loading({ c }: { c: ConfigApi }) {
  if (c.stale) return <p className="set-note">Ядро старее клиента, настроек в нём нет. Обнови ядро и перезагрузи страницу.</p>;
  return <p className="set-note">Загрузка…</p>;
}

const k = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Раздел «Агент»: ходы, команды, вывод, фоновое ревью. */
export function AgentPane({ c }: { c: ConfigApi }) {
  const v = c.v;
  if (!v) return <Loading c={c} />;
  const p = c.patch;
  return (
    <>
      <div className="set-sec">Поведение</div>
      <Row title="Лимит ходов" k="max_turns" desc="На лимите агент подводит итог и останавливается. Без лимита защитой остаётся бюджет контекста.">
        <Seg
          label="Лимит ходов"
          value={v.max_turns === 0 ? "0" : "n"}
          options={[
            ["0", "Без лимита"],
            ["n", v.max_turns === 0 ? "200" : String(v.max_turns)],
          ]}
          disabled={c.busy}
          onChange={(x) => p({ max_turns: x === "0" ? 0 : 200 })}
        />
      </Row>
      {v.max_turns !== 0 && (
        <Row title="Ходов на запуск" k="max_turns">
          <Num label="Ходов на запуск" value={v.max_turns} min={1} unit="ходов" disabled={c.busy} onCommit={(n) => p({ max_turns: n })} />
        </Row>
      )}
      <Row title="Таймаут команды" k="timeout_seconds" desc="Сколько по умолчанию живёт один вызов run.">
        <Num label="Таймаут команды" value={v.timeout_seconds} min={1} unit="с" disabled={c.busy} onCommit={(n) => p({ timeout_seconds: n })} />
      </Row>
      <div className="set-sec">Вывод тулов и вложения</div>
      <Row title="Результат для модели" k="max_result_chars" desc="Сколько символов одного результата доезжает до модели.">
        <Num label="Результат для модели" value={v.max_result_chars} min={1} unit="симв." disabled={c.busy} onCommit={(n) => p({ max_result_chars: n })} />
      </Row>
      <Row title="Сокращать вывод" k="reduce_output" desc="Убирать ANSI, длинные строки и повторы до отправки модели.">
        <Toggle label="Сокращать вывод" on={v.reduce_output} disabled={c.busy} onChange={(x) => p({ reduce_output: x })} />
      </Row>
      <Row title="Вложения" k="attachments" desc="Картинки и файлы уезжают модели. Отключи для моделей, которые понимают только текст.">
        <Toggle label="Вложения" on={v.attachments} disabled={c.busy} onChange={(x) => p({ attachments: x })} />
      </Row>
      <Row title="Бюджет картинок" k="media_budget_bytes" desc="Сколько картинок уезжает в одном запросе. Сверх бюджета старые не отправляются, а остаются пометкой с путём: иначе провайдер ответит 413 на всё тело и сессию нельзя будет продолжить.">
        <Num label="Бюджет картинок" value={Math.round(v.media_budget_bytes / 1_048_576)} min={0} unit="МБ" disabled={c.busy} onCommit={(n) => p({ media_budget_bytes: n * 1_048_576 })} />
      </Row>
      <div className="set-sec">Фоновое ревью</div>
      <Row title="Минимум ходов" k="review_min_turns" desc="Сессии короче этого порога не разбираются.">
        <Num label="Минимум ходов" value={v.review_min_turns} unit="ходов" disabled={c.busy} onCommit={(n) => p({ review_min_turns: n })} />
      </Row>
      <Row title="Простой перед ревью" k="review_idle_seconds" desc="Тишина после конца хода. 0: ревью не запускается.">
        <Num label="Простой перед ревью" value={v.review_idle_seconds} unit="с" disabled={c.busy} onCommit={(n) => p({ review_idle_seconds: n })} />
      </Row>
      <ConfigOnly
        keys={[
          ["system_prompt", "свой системный промпт"],
          ["shell", "оболочка для run"],
          ["approval_timeout_seconds", "ожидание подтверждения sudo"],
          ["max_process_chars", "граница вывода процесса"],
          ["review_prompt", "свой промпт ревью"],
          ["instance_git", "коммит тикетов"],
        ]}
        path={c.cfg?.path}
      />
    </>
  );
}

/** Раздел «Контекст и память»: полоса с порогами, пороги, долгая память. */
export function ContextPane({ c }: { c: ConfigApi }) {
  const v = c.v;
  if (!v) return <Loading c={c} />;
  const p = c.patch;
  const win = v.ctx_window || 1;
  const budget = v.context_budget;
  const target = v.context_target || (budget ? Math.round(budget * 0.7) : 0);
  const at = (n: number) => `${Math.min(100, (n / win) * 100)}%`;
  return (
    <>
      <div
        className="ctx-bar"
        role="img"
        aria-label={`Окно модели ${k(win)}. ${budget ? `Уборка начинается на ${k(budget)}, после неё контекст сжимается до ${k(target)}.` : "Бюджет выбирается автоматически по окну."}`}
      >
        <div className="ctx-track">
          {budget > 0 && <div className="ctx-zone" style={{ width: at(budget) }} />}
        </div>
        {budget > 0 && (
          <>
            <div className="ctx-mark" data-pos="down" style={{ left: at(target) }}>
              <span>цель {k(target)}</span>
            </div>
            <div className="ctx-mark" data-pos="up" style={{ left: at(budget) }}>
              <span>бюджет {k(budget)}</span>
            </div>
          </>
        )}
        <div className="ctx-mark" data-pos="end" style={{ left: "100%" }}>
          <span>окно {k(win)}</span>
        </div>
      </div>
      {!budget && <p className="set-note">Бюджет и цель уборки сейчас выбирает ядро по окну модели. Задай бюджет, чтобы уборка начиналась раньше.</p>}
      <div className="set-sec">Уборка контекста</div>
      <Row title="Окно модели" k="ctx_window" desc="Физический предел контекста модели.">
        <Num label="Окно модели" value={v.ctx_window} min={1} unit="ток." disabled={c.busy} onCommit={(n) => p({ ctx_window: n })} />
      </Row>
      <Row title="Бюджет" k="context_budget" desc="Когда контекст дорастает сюда, старое убирается, детали остаются на диске. 0: авто по окну.">
        <Num label="Бюджет" value={v.context_budget} unit="ток." disabled={c.busy} onCommit={(n) => p({ context_budget: n })} />
      </Row>
      <Row
        title="Цель после уборки"
        k="context_target"
        desc={v.context_budget ? "До этого размера сжимается контекст. 0: 70% от бюджета." : "Задаётся только вместе с бюджетом."}
      >
        <Num
          label="Цель после уборки"
          value={v.context_target}
          unit="ток."
          disabled={c.busy || !v.context_budget}
          onCommit={(n) => p({ context_target: n })}
        />
      </Row>
      <div className="set-sec">Долгая память</div>
      <Row title="Память" k="memory.enabled" desc="Агент вспоминает прошлую работу перед ходом и записывает новое после.">
        <Toggle label="Память" on={v.memory_enabled} disabled={c.busy} onChange={(x) => p({ memory_enabled: x })} />
      </Row>
      <Row title="Когда вспоминать" k="memory.recall" desc="Каждый ход, один раз на сессию или только по вызову тула.">
        <Seg
          label="Когда вспоминать"
          value={v.memory_recall}
          options={[
            ["always", "Каждый ход"],
            ["session", "На сессию"],
            ["off", "Выкл."],
          ]}
          disabled={c.busy || !v.memory_enabled}
          onChange={(x) => p({ memory_recall: x })}
        />
      </Row>
      <Row title="Записывать ходы" k="memory.retain" desc="Каждый ответ уходит в память отдельным вызовом.">
        <Toggle label="Записывать ходы" on={v.memory_retain} disabled={c.busy || !v.memory_enabled} onChange={(x) => p({ memory_retain: x })} />
      </Row>
      <Row title="Программа памяти" k="memory.cmd" desc="Имя плагина или путь к своему бинарю со слэшем.">
        <Text label="Программа памяти" value={v.memory_cmd} disabled={c.busy} onCommit={(s) => p({ memory_cmd: s })} />
      </Row>
      <ConfigOnly
        keys={[
          ["context_reserve", "запас до предела окна"],
          ["keep_results", "нетронутые результаты"],
          ["[models.*]", "пороги по модели"],
          ["memory.timeout_seconds", "таймаут памяти"],
          ["memory.tag", "теги записи"],
        ]}
        path={c.cfg?.path}
      />
    </>
  );
}

/** Модель и модель подагентов: под списком провайдеров. */
export function ModelFields({ c }: { c: ConfigApi }) {
  const v = c.v;
  if (!v) return <Loading c={c} />;
  const p = c.patch;
  return (
    <>
      <div className="set-sec">Модели</div>
      <Row
        title="Модель"
        k="model"
        desc={v.active_provider ? `Берётся из профиля «${v.active_provider}», меняется в его карточке выше.` : "Модель основной сессии."}
      >
        <Text label="Модель" value={v.model} disabled={c.busy || Boolean(v.active_provider)} onCommit={(s) => s && p({ model: s })} />
      </Row>
      <Row title="Модель подагентов" k="subagent_model" desc="Пусто: как у основной.">
        <Text label="Модель подагентов" value={v.subagent_model} placeholder="как у основной" disabled={c.busy} onCommit={(s) => p({ subagent_model: s })} />
      </Row>
      <ConfigOnly
        keys={[
          ["headers", "заголовки запросов"],
          ["body_patch", "поля тела запроса"],
          ["stream_usage", "токены в стриме"],
          ["stream_idle_seconds", "обрыв стрима"],
        ]}
        path={c.cfg?.path}
      />
    </>
  );
}

/**
 * Ключи, которых нет в API настроек: их пока правят только в файле. Список
 * честно показывает, что ещё настраивается и где, а не делает вид, что всё тут.
 */
function ConfigOnly({ keys, path }: { keys: Array<[string, string]>; path?: string }) {
  return (
    <div className="cfg-only">
      <h4>Пока только в config.toml</h4>
      <p>Ядро не отдаёт эти ключи в API настроек. Правка в файле тоже действует со следующего хода.</p>
      <ul>
        {keys.map(([key, t]) => (
          <li key={key}>
            <code>{key}</code>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {path && <p className="cfg-path">{path}</p>}
    </div>
  );
}
