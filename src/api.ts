/**
 * Клиент локального API snens (`snens serve`, loopback:7420).
 * Ходим через /api — dev-сервер (vite proxy) сам подставляет Bearer,
 * чтобы токен не оказался в бандле.
 */

export interface SessionInfo {
  id: string;
  surface: string;
  state: string;
  run_id: string | null;
  /** Сессия-родитель, если это подагент. */
  parent?: string;
  /** Модель, которой реально шёл ход (у старых логов нет). */
  model?: string;
  /** Заголовок: сгенерированный ядром или первые слова первого сообщения. */
  title?: string;
  /** Время последней активности (unix, сек) — mtime лога сессии. */
  updated_at?: number;
  /** Сколько ходов модели прошло: у подагентов это главная цифра прогресса. */
  turns?: number;
  /** Последняя запись `Done` в журнале: `ok`, `max_turns`, пусто — не закрывалась. */
  done?: string;
  /** Когда подагент начал работу (unix, сек) — первая запись журнала. */
  started_at?: number;
  /** Когда подагент закрылся (запись `Done`); пусто — ещё работает. */
  done_at?: number;
}

export interface Part {
  kind: string;
  path: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

/** Расход одного хода: цена и попадание в кеш. */
export interface Usage {
  in_tok: number;
  cached_tok: number;
  out_tok: number;
  reason_tok: number;
  cost_micro: number;
}

export interface TranscriptMessage {
  seq: number;
  ts: number;
  /**
   * Роль записи. `recall` — служебная справка долгой памяти: ядро отдаёт её
   * только по запросу (`recall=1`), и клиент рисует её серой строкой.
   * `review` — маркер саморевью: короткая служебная строка в журнале, граница
   * зоны ответственности следующего ревью. В контекст модели не уезжает.
   */
  role: "user" | "assistant" | "tool" | "recall" | "review";
  content: string | null;
  source?: string;
  reasoning?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  exit?: number;
  /** Сколько занял вызов инструмента, мс. */
  ms?: number;
  /** Подставленный argv вызова (а не сырой JSON аргументов). */
  argv?: string[];
  /** Вложения инструмента: картинки, которые он положил в канал. */
  parts?: Part[];
  /** `steer` | `ask` | `report` — вставка в ход (человек, подагент). */
  via?: string;
  /** Автор вставки. */
  from?: string;
  /** Расход хода (только у assistant). */
  usage?: Usage;
}

/** Расклад рабочего окна сессии — считает ядро по проекции промпта. */
export interface WindowBreakdown {
  total: number;
  /** Системный промпт и рамки. */
  system: number;
  /** Реплики человека и ответы модели. */
  messages: number;
  /** Вызовы инструментов: имена, аргументы, описания. */
  tool_calls: number;
  /** Результаты вызовов. */
  tool_results: number;
  images: number;
  messages_count: number;
  tool_calls_count: number;
}

export interface SearchHit {
  id: string;
  title?: string;
  surface: string;
  updated_at?: number;
  matches: Array<{ seq: number; role: string; ts: number; snippet: string }>;
}

/**
 * Настройки инстанса (`GET/PUT /v1/config`): то, что правится без рестарта.
 * Действие — со следующего хода: ядро перечитывает файл на каждом ходу.
 */
export interface InstanceConfig {
  path: string;
  values: {
    model: string;
    subagent_model: string;
    /** 0 — без лимита ходов. */
    max_turns: number;
    review_min_turns: number;
    review_idle_seconds: number;
    timeout_seconds: number;
    max_result_chars: number;
    reduce_output: boolean;
    attachments: boolean;
    ctx_window: number;
    /** 0 — авто по окну модели. */
    context_budget: number;
    context_target: number;
    memory_enabled: boolean;
    memory_recall: "always" | "session" | "off";
    memory_retain: boolean;
    memory_cmd: string;
  };
}

/** Конфиг, каким он лежит в файле; правка — подмножеством тех же ключей. */
export type ConfigPatch = Partial<InstanceConfig["values"]>;

export interface SurfaceEvent {
  seq: number;
  session_id: string;
  run_id: string | null;
  type: string;
  [k: string]: unknown;
}

export interface History {
  cursor: number;
  events: SurfaceEvent[];
  messages: TranscriptMessage[];
}

/**
 * UUID для `command_id`. `crypto.randomUUID` есть только в secure context
 * (https или localhost) — по адресу вида http://100.73.69.107:5174 его нет, и
 * создание сессии падало с "crypto.randomUUID is not a function".
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`;
    try {
      const b = await r.json();
      if (b?.error?.message) detail = `${b.error.code}: ${b.error.message}`;
    } catch {
      /* тело не JSON — оставляем статус */
    }
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}

export const api = {
  sessions: () => j<{ sessions: SessionInfo[] }>("/v1/sessions"),

  create: (surface = "web") =>
    j<SessionInfo>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ command_id: uuid(), surface }),
    }),

  /** `recall: true` — включить в выдачу справку долгой памяти (галочка в настройках). */
  history: (id: string, recall = false) =>
    j<History>(`/v1/sessions/${id}/history${recall ? "?recall=1" : ""}`),

  send: (id: string, text: string, attachmentIds: string[] = []) =>
    j<unknown>(`/v1/sessions/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ command_id: uuid(), text, attachment_ids: attachmentIds }),
    }),

  stop: (id: string, runId: string) =>
    j<unknown>(`/v1/sessions/${id}/stop`, {
      method: "POST",
      body: JSON.stringify({ command_id: uuid(), run_id: runId }),
    }),

  model: () => j<{ model: string }>("/v1/model"),

  config: () => j<InstanceConfig>("/v1/config"),

  putConfig: (patch: ConfigPatch) =>
    j<InstanceConfig>("/v1/config", { method: "PUT", body: JSON.stringify(patch) }),

  context: (id: string) =>
    j<{ breakdown: WindowBreakdown; limit: number }>(`/v1/sessions/${id}/context`),

  search: (q: string, limit = 30) =>
    j<{ hits: SearchHit[] }>(`/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  remove: (id: string) => j<unknown>(`/v1/sessions/${id}`, { method: "DELETE" }),

  /** Загрузка вложения: raw bytes, имя и command_id в query. */
  upload: async (id: string, file: File): Promise<Part & { attachment_id: string; name: string }> => {
    const q = `filename=${encodeURIComponent(file.name)}&command_id=${uuid()}`;
    const r = await fetch(`/api/v1/sessions/${id}/attachments?${q}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!r.ok) {
      let detail = `${r.status} ${r.statusText}`;
      try {
        const b = await r.json();
        if (b?.error?.message) detail = `${b.error.code}: ${b.error.message}`;
      } catch {
        /* тело не JSON — оставляем статус */
      }
      throw new Error(detail);
    }
    const a = (await r.json()) as {
      attachment_id: string;
      name: string;
      path: string;
      mime: string;
      bytes: number;
    };
    return { ...a, kind: a.mime.split("/")[0] };
  },

  approve: (id: string, aid: string, allow: boolean) =>
    j<unknown>(`/v1/sessions/${id}/approvals/${aid}`, {
      method: "POST",
      body: JSON.stringify({ allow }),
    }),
};

/** SSE-поток событий сессии; EventSource сам переподключается. */
export function subscribe(
  id: string,
  after: number,
  onEvent: (e: SurfaceEvent) => void,
  onError?: (e: Event) => void,
): () => void {
  const es = new EventSource(`/api/v1/sessions/${id}/events?after=${after}`);
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as SurfaceEvent);
    } catch {
      /* битый кадр не должен валить поток */
    }
  };
  if (onError) es.onerror = onError;
  return () => es.close();
}

/**
 * Поток изменений списка сессий (`GET /v1/events`): подагент растёт, пока его
 * карточка на экране, и без этого висел бы «ждёт» до перезагрузки страницы.
 * Кадр — уже собранная запись сессии, клиенту остаётся upsert по `id`.
 */
export function subscribeSessions(
  onSession: (s: SessionInfo) => void,
  onError?: (e: Event) => void,
): () => void {
  const es = new EventSource("/api/v1/events");
  es.onmessage = (m) => {
    try {
      const e = JSON.parse(m.data) as { type: string; session: SessionInfo };
      if (e.type === "session.updated" && e.session?.id) onSession(e.session);
    } catch {
      /* битый кадр не должен валить поток */
    }
  };
  if (onError) es.onerror = onError;
  return () => es.close();
}
