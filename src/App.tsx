import { useEffect, useMemo, useRef, useState } from "react";
import {
  contextStats,
  messages as seedMessages,
  sessions,
  toolLog,
  type Block,
  type Message,
  type Role,
} from "./mock";
import { applyTheme, initialTheme, type Theme } from "./theme";

const ROLE_LABEL: Record<Role, string> = {
  user: "you",
  assistant: "snens",
  tool: "tool",
  system: "system",
};

function Code({ lang, code }: { lang: string; code: string }) {
  const rows = code.split("\n").map((line, i) => {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "";
    return (
      <div key={i} className={cls}>
        {line || " "}
      </div>
    );
  });
  return (
    <pre className="code" data-lang={lang}>
      {rows}
    </pre>
  );
}

function Bubble({ m }: { m: Message }) {
  return (
    <article className={`msg msg--${m.role}${m.pending ? " msg--pending" : ""}`}>
      <header className="msg__head">
        <span className="who">{ROLE_LABEL[m.role]}</span>
        {m.title && m.title !== m.role && <span>{m.title}</span>}
        <time>{m.time}</time>
      </header>
      <div className="msg__body">
        {m.blocks.map((b: Block, i) =>
          b.kind === "code" ? (
            <Code key={i} lang={b.lang} code={b.code} />
          ) : (
            <div key={i}>{b.text}</div>
          ),
        )}
      </div>
    </article>
  );
}

function ThemeBar({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const items: Array<[Theme, string]> = [
    ["auto", "sys"],
    ["light", "lgt"],
    ["dark", "drk"],
  ];
  return (
    <div className="themebar" role="group" aria-label="theme">
      {items.map(([key, label]) => (
        <button
          key={key}
          aria-pressed={theme === key}
          title={`theme: ${key === "auto" ? "по системе" : key}`}
          onClick={() => setTheme(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Inspector() {
  const pct = (contextStats.used / contextStats.limit) * 100;
  return (
    <aside className="inspector" aria-label="inspector">
      <section className="panel">
        <div className="panel__head">
          <span>context</span>
          <span>{pct.toFixed(2)}%</span>
        </div>
        <div className="panel__body">
          <div className="gauge">
            <span style={{ width: `${Math.max(pct, 1.5)}%` }} />
          </div>
          <dl className="kv">
            <dt>model</dt>
            <dd>{contextStats.model}</dd>
            <dt>provider</dt>
            <dd>{contextStats.provider}</dd>
            <dt>tokens</dt>
            <dd>
              {contextStats.used.toLocaleString("ru-RU")} /{" "}
              {contextStats.limit.toLocaleString("ru-RU")}
            </dd>
            <dt>turns</dt>
            <dd>{contextStats.turns}</dd>
            <dt>tools</dt>
            <dd>{contextStats.tools}</dd>
            <dt>skills</dt>
            <dd>{contextStats.skills}</dd>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <span>tools</span>
          <span>last {toolLog.length}</span>
        </div>
        <div className="panel__body log">
          {toolLog.map((t, i) => (
            <div key={i}>
              <b>{t.tool}</b>
              <span>{t.detail}</span>
              <i>{t.time}</i>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ flex: 1, borderBottom: 0 }}>
        <div className="panel__head">
          <span>next</span>
          <span>mock</span>
        </div>
        <div className="panel__body log">
          <div>
            <span>вёрстка и темы</span>
            <i>done</i>
          </div>
          <div>
            <span>подключить API чата</span>
            <i>next</i>
          </div>
          <div>
            <span>стрим тулов и диффов</span>
            <i>later</i>
          </div>
          <div>
            <span>tauri-обёртка</span>
            <i>later</i>
          </div>
        </div>
      </section>
    </aside>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [msgs, setMsgs] = useState<Message[]>(seedMessages);
  const [active, setActive] = useState("s1");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const turns = useMemo(
    () => msgs.filter((m) => m.role !== "system").length,
    [msgs],
  );

  function send() {
    const text = draft.trim();
    if (!text) return;
    const now = new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setMsgs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        time: now,
        blocks: [{ kind: "text", text }],
      },
    ]);
    setDraft("");
  }

  return (
    <div className="app">
      <nav className="rail" data-open={railOpen} aria-label="sessions">
        <div className="rail__brand">
          <span className="rail__mark">snens</span>
          <span className="rail__ver">v0.1 mock</span>
          <button
            className="rail__close"
            onClick={() => setRailOpen(false)}
            aria-label="закрыть"
          >
            ×
          </button>
        </div>

        <div className="rail__section">
          <span>sessions</span>
          <button className="ghost" title="new session">
            +
          </button>
        </div>

        <ul className="rail__list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                className="rail__item"
                aria-current={active === s.id}
                onClick={() => {
                  setActive(s.id);
                  setRailOpen(false);
                }}
              >
                {s.title}
                <small>{s.sub}</small>
              </button>
            </li>
          ))}
        </ul>

        <div className="rail__foot">
          <ThemeBar theme={theme} setTheme={setTheme} />
          <button className="solid">new session</button>
        </div>
      </nav>

      <main className="main">
        <header className="topbar">
          <button
            className="ghost burger"
            onClick={() => setRailOpen((v) => !v)}
            aria-label="sessions"
          >
            ≡
          </button>
          <span className="topbar__title">web-клиент для snens</span>
          <span className="chip chip--accent">mock</span>
          <div className="topbar__meta">
            <span className="chip">
              <span className="dot" /> online
            </span>
            <span>{contextStats.model}</span>
            <span>{turns} ходов</span>
          </div>
        </header>

        <div className="feed" ref={feedRef}>
          {msgs.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
        </div>

        <div className="composer">
          <div className="composer__box">
            <textarea
              value={draft}
              placeholder="печатай… enter — отправить, shift+enter — перенос"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="solid" onClick={send}>
              send
            </button>
          </div>
          <div className="composer__hint">
            <span>cwd {contextStats.cwd}</span>
            <span>tools {contextStats.tools}</span>
            <span>ctx {((contextStats.used / contextStats.limit) * 100).toFixed(2)}%</span>
            <span style={{ marginLeft: "auto" }}>данные — мок</span>
          </div>
        </div>
      </main>

      <Inspector />
    </div>
  );
}
