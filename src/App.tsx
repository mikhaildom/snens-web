import { useEffect, useMemo, useRef, useState } from "react";
import {
  contextStats,
  messages as seedMessages,
  sessions,
  toolRuns,
  windows,
  type Block,
  type Message,
  type Role,
  type ToolRun,
  type Win,
} from "./mock";
import { applyTheme, initialTheme, type Theme } from "./theme";
import { useResize } from "./useResize";

const ROLE_LABEL: Record<Role, string> = {
  user: "you",
  assistant: "snens",
  tool: "tool",
  system: "system",
};

type DockTab = "windows" | "tools";

function Code({ code }: { code: string }) {
  const rows = code.split("\n").map((line, i) => {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "";
    return (
      <div key={i} className={cls}>
        {line || " "}
      </div>
    );
  });
  return <pre className="code">{rows}</pre>;
}

function Line({ m }: { m: Message }) {
  return (
    <article className={`msg msg--${m.role}${m.pending ? " msg--pending" : ""}`}>
      <header className="msg__head">
        <span className="who">{ROLE_LABEL[m.role]}</span>
        {m.title && m.title !== m.role && <span>{m.title}</span>}
        <time>{m.time}</time>
      </header>
      <div className="msg__body">
        {m.blocks.map((b: Block, i) =>
          b.kind === "code" ? <Code key={i} code={b.code} /> : <div key={i}>{b.text}</div>,
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

function Window({ w }: { w: Win }) {
  const [open, setOpen] = useState(w.kind !== "doc");
  return (
    <section className="win">
      <button className="win__bar" onClick={() => setOpen((v) => !v)}>
        <span className="win__kind">{w.kind}</span>
        <span>{w.title}</span>
        <span className="win__state" data-state={w.state}>
          {w.state === "running" ? "● " : w.state === "done" ? "✓ " : ""}
          {w.state}
        </span>
      </button>
      {open && (
        <div className="win__body">
          <span className="urlbar">{w.meta}</span>
          {w.kind === "browser" ? (
            <div className="skeleton">
              <i style={{ width: "62%" }} />
              <i style={{ width: "88%" }} />
              <i style={{ width: "74%" }} />
              <i style={{ width: "40%" }} />
            </div>
          ) : (
            w.body.map((line, i) => <pre key={i}>{line}</pre>)
          )}
        </div>
      )}
    </section>
  );
}

function ToolRunRow({ t }: { t: ToolRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="win">
      <button className="win__bar" onClick={() => setOpen((v) => !v)}>
        <span className="win__kind">
          {t.state === "ok" ? "✓" : t.state === "error" ? "×" : "●"}
        </span>
        <span>{t.tool}</span>
        <span className="win__arg">{t.arg}</span>
        <span className="win__state" data-state={t.state}>
          {t.ms}
        </span>
      </button>
      {open && (
        <div className="win__body">
          <pre>{t.out}</pre>
        </div>
      )}
    </div>
  );
}

function Dock({
  tab,
  setTab,
  onClose,
}: {
  tab: DockTab;
  setTab: (t: DockTab) => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="dock__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "windows"}
          onClick={() => setTab("windows")}
        >
          окна <b>{windows.length}</b>
        </button>
        <button role="tab" aria-selected={tab === "tools"} onClick={() => setTab("tools")}>
          тулы <b>{toolRuns.length}</b>
        </button>
        {onClose && (
          <button className="dock__close" onClick={onClose} aria-label="закрыть док">
            ×
          </button>
        )}
      </div>
      <div className="dock__body" role="tabpanel">
        {tab === "windows"
          ? windows.map((w) => <Window key={w.id} w={w} />)
          : toolRuns.map((t) => <ToolRunRow key={t.id} t={t} />)}
      </div>
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [msgs, setMsgs] = useState<Message[]>(seedMessages);
  const [active, setActive] = useState("s1");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("windows");
  const [dockOpen, setDockOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const rail = useResize("snens-rail-w", 224, 176, 380, 1);
  const dock = useResize("snens-dock-w", 320, 240, 620, -1);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const turns = useMemo(() => msgs.filter((m) => m.role !== "system").length, [msgs]);
  const pct = (contextStats.used / contextStats.limit) * 100;

  function send() {
    const text = draft.trim();
    if (!text) return;
    const now = new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setMsgs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", time: now, blocks: [{ kind: "text", text }] },
    ]);
    setDraft("");
  }

  return (
    <div
      className="app"
      style={{ "--rail-w": `${rail.size}px`, "--dock-w": `${dock.size}px` } as React.CSSProperties}
    >
      <nav className="rail" data-open={railOpen} aria-label="sessions">
        <div className="rail__brand">
          <span className="rail__mark">snens</span>
          <span className="rail__ver">v0.1 mock</span>
          <button className="rail__close" onClick={() => setRailOpen(false)} aria-label="закрыть">
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

      <div className="grip grip--rail" title="тяни · двойной клик — сброс" {...rail.gripProps} />

      <main className="main">
        <header className="topbar">
          <button className="ghost burger" onClick={() => setRailOpen(true)} aria-label="sessions">
            ≡
          </button>
          <span className="topbar__title">web-клиент для snens</span>
          <div className="topbar__meta">
            <button
              className="ghost dock-toggle"
              onClick={() => setDockOpen(true)}
              aria-label="док"
            >
              док
            </button>
            <span className="chip">
              <span className="dot" /> online
            </span>
            <span className="chip chip--accent">mock</span>
          </div>
        </header>

        <div className="feed" ref={feedRef}>
          {msgs.map((m) => (
            <Line key={m.id} m={m} />
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
        </div>

        <div className="statusbar">
          <span className="sb--key">
            <span className="sb--model-full">{contextStats.model}</span>
            <span className="sb--model-short">dsv4-flash</span>
          </span>
          <span className="sb--grow">
            {contextStats.cwd} · {turns} ходов
          </span>
          <span className="sb--opt">
            <span className="gauge">
              <span style={{ width: `${Math.max(pct, 2)}%` }} />
            </span>
            {pct.toFixed(2)}%
          </span>
          <span className="sb--opt">~{Math.round(contextStats.used / 1000)}k / 1M</span>
        </div>
      </main>

      <div className="grip grip--dock" title="тяни · двойной клик — сброс" {...dock.gripProps} />

      <aside className="dock" aria-label="dock">
        <Dock tab={dockTab} setTab={setDockTab} />
      </aside>

      <aside className="dock dock--sheet" data-open={dockOpen} aria-label="dock">
        {dockOpen && (
          <Dock tab={dockTab} setTab={setDockTab} onClose={() => setDockOpen(false)} />
        )}
      </aside>
    </div>
  );
}
