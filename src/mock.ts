export type Role = "user" | "assistant" | "tool" | "system";

export type Block =
  | { kind: "text"; text: string }
  | { kind: "code"; lang: string; code: string };

export interface Message {
  id: string;
  role: Role;
  time: string;
  title?: string;
  blocks: Block[];
  pending?: boolean;
}

export interface Session {
  id: string;
  title: string;
  sub: string;
}

export interface Win {
  id: string;
  kind: "agent" | "browser" | "doc";
  title: string;
  state: "running" | "idle" | "done";
  meta: string;
  body: string[];
}

export interface ToolRun {
  id: string;
  tool: string;
  arg: string;
  state: "ok" | "running" | "error";
  ms: string;
  out: string;
}

export const contextStats = {
  model: "deepseek-v4.1-flash",
  provider: "nous",
  used: 34_120,
  limit: 1_000_000,
  turns: 42,
  cwd: "~/projects/snens-web",
  tools: 14,
  skills: 3,
};

export const sessions: Session[] = [
  { id: "s1", title: "web-клиент для snens", sub: "сейчас · 42 хода" },
  { id: "s2", title: "memory: sqlite-vec реиндекс", sub: "вчера" },
  { id: "s3", title: "caddy: cert для pages", sub: "2 дня" },
  { id: "s4", title: "telegram: кнопки одобрения", sub: "4 дня" },
  { id: "s5", title: "snens-next dev verify", sub: "неделя" },
];

export const messages: Message[] = [
  {
    id: "m1",
    role: "system",
    time: "09:41",
    blocks: [
      {
        kind: "text",
        text: "cwd ~/projects/snens-web · deepseek/deepseek-v4.1-flash-1017 · tools 14",
      },
    ],
  },
  {
    id: "m2",
    role: "user",
    time: "09:41",
    blocks: [
      {
        kind: "text",
        text: "хочу веб-интерфейс snens, из которого потом сделать десктоп-приложение. начни с мокапа: реакт, дев-сервер, брутализм, моношрифты, системная тема.",
      },
    ],
  },
  {
    id: "m3",
    role: "assistant",
    time: "09:42",
    blocks: [
      {
        kind: "text",
        text: "Каркас: rail со сессиями, лента ходов, composer, инспектор контекста. Тема — на CSS-переменных, auto читает prefers-color-scheme; переключатель в подвале rail перекрывает систему.",
      },
      {
        kind: "code",
        lang: "sh",
        code: "npm create vite@latest snens-web -- --template react-ts\nnpm i && npm run dev",
      },
    ],
  },
  {
    id: "m4",
    role: "tool",
    time: "09:42",
    title: "run",
    blocks: [
      {
        kind: "code",
        lang: "diff",
        code: "+ VITE v8.3.4  ready in 214 ms\n+ ➜  Local:   http://100.73.69.107:5174/\n- strictPort: 5174 свободен",
      },
    ],
  },
  {
    id: "m5",
    role: "assistant",
    time: "09:43",
    blocks: [
      {
        kind: "text",
        text: "Дальше по вкусу: справа — рабочие окна (подагенты, браузер, документ) и разворот логов тулов. Скажи, какой экран важнее — сделаю его первым по-настоящему.",
      },
    ],
    pending: true,
  },
];

export const windows: Win[] = [
  {
    id: "w1",
    kind: "agent",
    title: "researcher",
    state: "running",
    meta: "subagent · 3-й ход",
    body: [
      "читает ~/projects/snens/src/exec.rs",
      "grep timeout_seconds · 6 совпадений",
      "сверяет с тикетом run-timeout-silent-124",
    ],
  },
  {
    id: "w2",
    kind: "browser",
    title: "preview :5174",
    state: "idle",
    meta: "webview",
    body: ["http://100.73.69.107:5174/", "viewport 1440×900 · mock"],
  },
  {
    id: "w3",
    kind: "doc",
    title: "tickets/2026-09-27",
    state: "done",
    meta: "long-job-no-handle.md",
    body: ["status: open", "hits: 5 · kind: opportunity"],
  },
];

export const toolRuns: ToolRun[] = [
  {
    id: "t1",
    tool: "run",
    arg: "npm create vite",
    state: "ok",
    ms: "1.9s",
    out: "scaffolding react-ts …\nindex.html src/main.tsx src/App.tsx",
  },
  {
    id: "t2",
    tool: "run",
    arg: "npm i",
    state: "ok",
    ms: "8.1s",
    out: "added 168 packages · 0 vulnerabilities",
  },
  {
    id: "t3",
    tool: "write",
    arg: "src/index.css",
    state: "ok",
    ms: "13.4KB",
    out: "тема, rail, лента, composer, dock",
  },
  {
    id: "t4",
    tool: "edit",
    arg: "src/App.tsx",
    state: "ok",
    ms: "3 правки",
    out: "replaced 3 · unchanged 0",
  },
  {
    id: "t5",
    tool: "run",
    arg: "vite --port 5174",
    state: "running",
    ms: "—",
    out: "listening on 100.73.69.107:5174",
  },
];
