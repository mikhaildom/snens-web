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
  active?: boolean;
  unread?: boolean;
}

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
    title: "session",
    blocks: [
      {
        kind: "text",
        text: "cwd ~/projects/snens-web · model deepseek/deepseek-v4.1-flash-1017 · tools 14",
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
    title: "assistant",
    blocks: [
      {
        kind: "text",
        text: "Каркас: rail со сессиями, лента ходов, composer, инспектор контекста. Тема — на CSS-переменных, auto читает prefers-color-scheme; переключатель в подвале rail перекрывает систему.",
      },
      {
        kind: "code",
        lang: "sh",
        code: "npm create vite@latest snens-web -- --template react-ts\nnpm i && npm run dev -- --host 127.0.0.1 --port 5173",
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
        code: "+ VITE v7.1.4  ready in 214 ms\n+ ➜  Local:   http://127.0.0.1:5173/\n- port 5173 was free, strictPort on",
      },
    ],
  },
  {
    id: "m5",
    role: "assistant",
    time: "09:43",
    title: "assistant",
    blocks: [
      {
        kind: "text",
        text: "Дальше по вкусу: очередь тикетов в rail, дерево инструментов справа, diff-вьюер для правок. Скажи, какой экран важнее — сделаю его первым по-настоящему.",
      },
    ],
    pending: true,
  },
];

export const toolLog: Array<{ tool: string; detail: string; time: string }> = [
  { tool: "run", detail: "npm create vite", time: "214ms" },
  { tool: "run", detail: "npm i", time: "8.1s" },
  { tool: "write", detail: "src/index.css", time: "1.2KB" },
  { tool: "write", detail: "src/App.tsx", time: "0.9KB" },
  { tool: "run", detail: "npm run dev", time: "214ms" },
];

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
