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
  /** Заголовок: сгенерированный ядром или первые слова первого сообщения. */
  title?: string;
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
      body: JSON.stringify({ command_id: crypto.randomUUID(), surface }),
    }),

  history: (id: string) => j<History>(`/v1/sessions/${id}/history`),

  send: (id: string, text: string) =>
    j<unknown>(`/v1/sessions/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ command_id: crypto.randomUUID(), text }),
    }),

  stop: (id: string, runId: string) =>
    j<unknown>(`/v1/sessions/${id}/stop`, {
      method: "POST",
      body: JSON.stringify({ command_id: crypto.randomUUID(), run_id: runId }),
    }),

  model: () => j<{ model: string }>("/v1/model"),

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
