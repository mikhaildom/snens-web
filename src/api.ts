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
  role: "user" | "assistant" | "tool";
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

export interface SearchHit {
  id: string;
  title?: string;
  surface: string;
  updated_at?: number;
  matches: Array<{ seq: number; role: string; ts: number; snippet: string }>;
}

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

  history: (id: string) => j<History>(`/v1/sessions/${id}/history`),

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
