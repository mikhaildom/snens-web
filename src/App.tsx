import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  subscribe,
  type SessionInfo,
  type SurfaceEvent,
  type TranscriptMessage,
} from "./api";
import { applyTheme, initialTheme, type Theme } from "./theme";
import { useResize } from "./useResize";

type DockTab = "windows" | "tools";

interface ToolRun {
  callId: string;
  name: string;
  args: string;
  state: "running" | "ok" | "error" | "cancelled";
  exit?: number;
  preview: string;
  ms?: number;
  started?: number;
  done?: number;
}

interface Approval {
  id: string;
  command: string;
  cwd: string;
}

const time = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function shortArgs(raw: string): string {
  try {
    const v = JSON.parse(raw);
    const first =
      v.cmd ?? v.path ?? v.url ?? v.query ?? v.args?.[0] ?? v.text ?? Object.values(v)[0];
    const s = Array.isArray(first) ? first.join(" ") : String(first ?? "");
    return s.length > 72 ? `${s.slice(0, 72)}…` : s;
  } catch {
    return raw.slice(0, 72);
  }
}

/* ── лента ──────────────────────────────────────────────── */

function Code({ code }: { code: string }) {
  return (
    <pre className="code">
      {code.split("\n").map((line, i) => (
        <div key={i}>{line || " "}</div>
      ))}
    </pre>
  );
}

function Turn({ m }: { m: TranscriptMessage }) {
  const [open, setOpen] = useState(false);
  const head = (
    <header className="msg__head">
      <span className="who">{m.role === "user" ? "you" : m.role === "tool" ? m.name ?? "tool" : "snens"}</span>
      {m.role === "tool" && <span>exit {m.exit ?? "?"}</span>}
      {m.role === "assistant" && m.tool_calls?.length ? (
        <span>
          {m.tool_calls.length} {m.tool_calls.length === 1 ? "тул" : "тулов"}
        </span>
      ) : null}
      <time>{time(m.ts)}</time>
    </header>
  );

  if (m.role === "tool") {
    return (
      <article className="msg msg--tool">
        <button className="msg__toggle" onClick={() => setOpen((v) => !v)}>
          {head}
        </button>
        {open && m.content && <div className="msg__body">{m.content}</div>}
      </article>
    );
  }

  return (
    <article className={`msg msg--${m.role}`}>
      {head}
      <div className="msg__body">
        {m.reasoning && <div className="reasoning">{m.reasoning}</div>}
        {m.content && <div className="text">{m.content}</div>}
        {m.tool_calls?.map((c) => (
          <Code key={c.id} code={`${c.function.name} ${shortArgs(c.function.arguments)}`} />
        ))}
      </div>
    </article>
  );
}

function Live({ content, reasoning }: { content: string; reasoning: string }) {
  if (!content && !reasoning) return null;
  return (
    <article className="msg msg--assistant msg--pending">
      <header className="msg__head">
        <span className="who">snens</span>
        <span>стрим</span>
      </header>
      <div className="msg__body">
        {reasoning && <div className="reasoning">{reasoning}</div>}
        {content && <div className="text">{content}</div>}
      </div>
    </article>
  );
}

/* ── док ────────────────────────────────────────────────── */

function ToolRow({ t }: { t: ToolRun }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="win">
      <button className="win__bar" onClick={() => setOpen((v) => !v)}>
        <span className="win__kind">
          {t.state === "ok" ? "✓" : t.state === "error" ? "×" : t.state === "cancelled" ? "−" : "●"}
        </span>
        <span>{t.name}</span>
        <span className="win__arg">{shortArgs(t.args)}</span>
        <span className="win__state" data-state={t.state}>
          {t.ms != null ? `${(t.ms / 1000).toFixed(1)}s` : t.state}
        </span>
      </button>
      {open && (
        <div className="win__body">
          <pre>{t.args}</pre>
          {t.preview && <pre>{t.preview}</pre>}
        </div>
      )}
    </section>
  );
}

function Dock({
  tab,
  setTab,
  tools,
  onClose,
}: {
  tab: DockTab;
  setTab: (t: DockTab) => void;
  tools: ToolRun[];
  onClose?: () => void;
}) {
  const running = tools.filter((t) => t.state === "running").length;
  return (
    <>
      <div className="dock__tabs" role="tablist">
        <button role="tab" aria-selected={tab === "windows"} onClick={() => setTab("windows")}>
          окна
        </button>
        <button role="tab" aria-selected={tab === "tools"} onClick={() => setTab("tools")}>
          тулы <b>{tools.length}</b>
          {running ? <b className="live">{running}</b> : null}
        </button>
        {onClose && (
          <button className="dock__close" onClick={onClose} aria-label="закрыть док">
            ×
          </button>
        )}
      </div>
      <div className="dock__body" role="tabpanel">
        {tab === "windows" ? (
          <div className="dock__empty">
            окон пока нет.
            <br />
            здесь будут подагенты и их рабочие поверхности — ядро пока не отдаёт их по API.
          </div>
        ) : tools.length === 0 ? (
          <div className="dock__empty">в этой сессии тулы ещё не звались.</div>
        ) : (
          tools.map((t) => <ToolRow key={t.callId} t={t} />)
        )}
      </div>
    </>
  );
}

/* ── тема ───────────────────────────────────────────────── */

function ThemeBar({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
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

/* ── приложение ─────────────────────────────────────────── */

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<TranscriptMessage[]>([]);
  const [stream, setStream] = useState({ content: "", reasoning: "" });
  const [live, setLive] = useState<Record<string, ToolRun>>({});
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(() =>
    new URLSearchParams(location.search).has("dock"),
  );
  const [dockTab, setDockTab] = useState<DockTab>("tools");
  const [showAll, setShowAll] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const rail = useResize("snens-rail-w", 224, 176, 380, 1);
  const dock = useResize("snens-dock-w", 320, 240, 620, -1);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /* список сессий */
  const loadSessions = useCallback(async () => {
    try {
      const { sessions } = await api.sessions();
      const sorted = sessions.slice().sort((a, b) => (a.id < b.id ? 1 : -1));
      setSessions(sorted);
      return sorted;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return [];
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, m] = await Promise.all([loadSessions(), api.model().catch(() => null)]);
      if (!alive) return;
      if (m) setModel(m.model);
      setActive((prev) => prev ?? new URLSearchParams(location.search).get("session") ?? list[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [loadSessions]);

  /* история + SSE выбранной сессии */
  const reload = useCallback(async (id: string) => {
    const h = await api.history(id);
    setMsgs(h.messages);
    return h.cursor;
  }, []);

  useEffect(() => {
    if (!active) return;
    let closed = false;
    setMsgs([]);
    setLive({});
    setStream({ content: "", reasoning: "" });
    setApproval(null);

    let stop: (() => void) | undefined;
    (async () => {
      try {
        const h = await api.history(active);
        if (closed) return;
        setMsgs(h.messages);
        // ?nostream=1 — статичный снимок истории без SSE (скриншоты, отладка)
        const noStream = new URLSearchParams(location.search).has("nostream");
        if (!noStream) stop = subscribe(active, h.cursor, (e: SurfaceEvent) => {
          switch (e.type) {
            case "run.started":
              setRunning(true);
              setRunId(e.run_id ?? null);
              setStream({ content: "", reasoning: "" });
              break;
            case "assistant.delta": {
              const text = String(e.text ?? "");
              const kind = String(e.kind ?? "content");
              setStream((s) =>
                kind === "reasoning"
                  ? { ...s, reasoning: s.reasoning + text }
                  : { ...s, content: s.content + text },
              );
              break;
            }
            case "tool.started": {
              const callId = String(e.call_id ?? "");
              setLive((prev) => ({
                ...prev,
                [callId]: {
                  callId,
                  name: String(e.name ?? "tool"),
                  args: String(e.args ?? ""),
                  state: "running",
                  preview: "",
                  started: Date.now(),
                },
              }));
              break;
            }
            case "tool.completed": {
              const callId = String(e.call_id ?? "");
              setLive((prev) => {
                const old = prev[callId];
                const exit = Number(e.exit ?? 0);
                const done = Date.now();
                return {
                  ...prev,
                  [callId]: {
                    callId,
                    name: old?.name ?? String(e.name ?? "tool"),
                    args: old?.args ?? "",
                    state: exit === 0 ? "ok" : "error",
                    exit,
                    preview: String(e.preview ?? ""),
                    started: old?.started,
                    done,
                    ms: old?.started ? done - old.started : undefined,
                  },
                };
              });
              break;
            }
            case "approval.requested":
              setApproval({
                id: String(e.approval_id ?? ""),
                command: String(e.command ?? ""),
                cwd: String(e.cwd ?? ""),
              });
              break;
            case "approval.resolved":
              setApproval((a) => (a && a.id === String(e.approval_id ?? "") ? null : a));
              break;
            case "run.finished": {
              setRunning(false);
              setRunId(null);
              setStream({ content: "", reasoning: "" });
              const status = String(e.status ?? "");
              if (status !== "ok" && e.error) setError(`${status}: ${e.error}`);
              // канонический транскрипт — из журнала, а не из стрима
              api.history(active).then((x) => {
                if (!closed) setMsgs(x.messages);
              });
              break;
            }
          }
        });
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    })();

    return () => {
      closed = true;
      stop?.();
    };
  }, [active, reload]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, stream.content, stream.reasoning]);

  /* тулы сессии: из журнала + живые события */
  const tools = useMemo<ToolRun[]>(() => {
    const out: ToolRun[] = [];
    const byId = new Map<string, ToolRun>();
    for (const m of msgs) {
      if (m.role === "assistant" && m.tool_calls) {
        for (const c of m.tool_calls) {
          const t: ToolRun = {
            callId: c.id,
            name: c.function.name,
            args: c.function.arguments,
            state: "running",
            preview: "",
          };
          out.push(t);
          byId.set(c.id, t);
        }
      }
      if (m.role === "tool" && m.tool_call_id) {
        const t = byId.get(m.tool_call_id);
        const exit = m.exit ?? 0;
        if (t) {
          t.state = exit === 0 ? "ok" : "error";
          t.exit = exit;
          t.preview = m.content ?? "";
          t.name = m.name ?? t.name;
        } else {
          out.push({
            callId: m.tool_call_id,
            name: m.name ?? "tool",
            args: "",
            state: exit === 0 ? "ok" : "error",
            exit,
            preview: m.content ?? "",
          });
        }
      }
    }
    for (const t of Object.values(live)) {
      const idx = out.findIndex((x) => x.callId === t.callId);
      if (idx >= 0) out[idx] = t;
      else out.push(t);
    }
    return out;
  }, [msgs, live]);

  const turns = msgs.filter((m) => m.role !== "tool").length;
  const current = sessions.find((s) => s.id === active);
  const visible = showAll ? sessions : sessions.filter((s) => s.surface !== "legacy");
  const legacyCount = sessions.length - visible.length;

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    try {
      let id = active;
      if (!id) {
        const created = await api.create("web");
        id = created.id;
        setActive(id);
        setSessions((prev) => [created, ...prev]);
      }
      await api.send(id, text);
      setDraft("");
      setRunning(true);
      const h = await api.history(id);
      setMsgs(h.messages);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function newSession() {
    try {
      const created = await api.create("web");
      setSessions((prev) => [created, ...prev]);
      setActive(created.id);
      setRailOpen(false);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function decide(allow: boolean) {
    if (!approval || !active) return;
    try {
      await api.approve(active, approval.id, allow);
      setApproval(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div
      className="app"
      style={{ "--rail-w": `${rail.size}px`, "--dock-w": `${dock.size}px` } as React.CSSProperties}
    >
      <nav className="rail" data-open={railOpen} aria-label="sessions">
        <div className="rail__brand">
          <span className="rail__mark">snens</span>
          <span className="rail__ver">web</span>
          <button className="rail__close" onClick={() => setRailOpen(false)} aria-label="закрыть">
            ×
          </button>
        </div>

        <div className="rail__section">
          <span>sessions {visible.length}</span>
          <button className="ghost" title="new session" onClick={newSession}>
            +
          </button>
        </div>

        <ul className="rail__list">
          {visible.map((s) => (
            <li key={s.id}>
              <button
                className="rail__item"
                aria-current={active === s.id}
                onClick={() => {
                  setActive(s.id);
                  setRailOpen(false);
                }}
              >
                {s.surface === "web" ? s.id.slice(0, 8) : s.id}
                <small>
                  {s.surface} · {s.state}
                </small>
              </button>
            </li>
          ))}
        </ul>

        <div className="rail__foot">
          {legacyCount > 0 && !showAll && (
            <button className="ghost rail__more" onClick={() => setShowAll(true)}>
              ещё {legacyCount} legacy-сессий
            </button>
          )}
          {showAll && (
            <button className="ghost rail__more" onClick={() => setShowAll(false)}>
              скрыть legacy
            </button>
          )}
          <ThemeBar theme={theme} setTheme={setTheme} />
          <button className="solid" onClick={newSession}>
            new session
          </button>
        </div>
      </nav>

      <div className="grip grip--rail" title="тяни · двойной клик — сброс" {...rail.gripProps} />

      <main className="main">
        <header className="topbar">
          <button className="ghost burger" onClick={() => setRailOpen(true)} aria-label="sessions">
            ≡
          </button>
          <span className="topbar__title">{current ? current.id : "новая сессия"}</span>
          <div className="topbar__meta">
            <button className="ghost dock-toggle" onClick={() => setDockOpen(true)} aria-label="док">
              док
            </button>
            <span className="chip">
              <span className="dot" style={{ background: running ? "var(--accent)" : "var(--ok)" }} />
              {running ? "работает" : "idle"}
            </span>
            {running && active && runId && (
              <button
                className="chip"
                onClick={() => api.stop(active, runId).catch((e) => setError(String(e)))}
              >
                stop
              </button>
            )}
          </div>
        </header>

        <div className="feed" ref={feedRef}>
          {loading && <div className="msg msg--system">загрузка…</div>}
          {!loading && msgs.length === 0 && (
            <div className="msg msg--system">
              <div className="msg__body">пустая сессия — напиши первое сообщение.</div>
            </div>
          )}
          {msgs.map((m) => (
            <Turn key={m.seq} m={m} />
          ))}
          <Live content={stream.content} reasoning={stream.reasoning} />
          {approval && (
            <article className="msg msg--approval">
              <header className="msg__head">
                <span className="who">approval</span>
                <span>sudo</span>
              </header>
              <div className="msg__body">
                <Code code={`${approval.command}\ncwd ${approval.cwd}`} />
                <div className="approval__actions">
                  <button className="solid" onClick={() => decide(true)}>
                    разрешить один раз
                  </button>
                  <button onClick={() => decide(false)}>отклонить</button>
                </div>
              </div>
            </article>
          )}
          {error && (
            <article className="msg msg--error">
              <header className="msg__head">
                <span className="who">error</span>
                <button className="ghost" onClick={() => setError(null)}>
                  ×
                </button>
              </header>
              <div className="msg__body">{error}</div>
            </article>
          )}
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
          <span className="sb--key" title={model}>
            <span className="sb--model-full">{model || "—"}</span>
            <span className="sb--model-short">{model.split("/").pop()?.replace("deepseek-v4.1-", "dsv4-") ?? "—"}</span>
          </span>
          <span className="sb--grow">
            {current ? `${current.surface} · ${current.state}` : "нет сессии"} · {turns} записей
          </span>
          <span className="sb--opt">тулов {tools.length}</span>
          <span className="sb--opt">{running ? "ход идёт" : "простой"}</span>
        </div>
      </main>

      <div className="grip grip--dock" title="тяни · двойной клик — сброс" {...dock.gripProps} />

      <aside className="dock" aria-label="dock">
        <Dock tab={dockTab} setTab={setDockTab} tools={tools} />
      </aside>

      <aside className="dock dock--sheet" data-open={dockOpen} aria-label="dock">
        {dockOpen && (
          <Dock
            tab={dockTab}
            setTab={setDockTab}
            tools={tools}
            onClose={() => setDockOpen(false)}
          />
        )}
      </aside>
    </div>
  );
}
