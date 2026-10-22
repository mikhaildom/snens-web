import { useCallback, useEffect, useMemo, useState } from "react";
import { api, uuid, type SessionInfo } from "./api";
import { buildBlocks, collectTools } from "./lenta";
import { applyTheme, initialTheme, type Theme } from "./theme";
import { initialSettings, saveSettings, type Settings } from "./settings";
import { useResize } from "./useResize";
import { useActiveSession } from "./hooks/useActiveSession";
import { useSessions } from "./hooks/useSessions";
import { useTranscript } from "./hooks/useTranscript";
import { useContextWindow } from "./hooks/useContextWindow";
import { useSearch } from "./hooks/useSearch";
import { useFeedScroll } from "./hooks/useFeedScroll";
import { Rail } from "./rail/Rail";
import { Topbar } from "./rail/Topbar";
import { Statusbar } from "./rail/Statusbar";
import { Composer, type PendingFile } from "./composer/Composer";
import { EmptySession, Feed, Hello } from "./feed/Feed";
import { Agents } from "./dock/Agents";
import { ContextWindow } from "./dock/ContextWindow";
import { Dock, type DockTab } from "./dock/Dock";

/** Приложение: состояние сессии и раскладка, вся разметка — в компонентах. */
export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  // Настройки отображения (показ справки памяти и прочее) — вкус человека,
  // живут в localStorage, а не в конфиге ядра.
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const showRecall = settings.showRecall;

  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((e: string) => setError(e), []);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(() => new URLSearchParams(location.search).has("dock"));
  // `?tab=windows` открывает док сразу на подагентах: без этого скриншот дока
  // требует сначала клика, а `shot --selector` со скриптом не совмещается.
  const [dockTab, setDockTab] = useState<DockTab>(() =>
    new URLSearchParams(location.search).get("tab") === "windows" ? "windows" : "tools",
  );
  /** Файлы, приложенные к ещё не отправленному сообщению. */
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** Сессия, у которой открыто подтверждение удаления. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { active, select, push, back } = useActiveSession();
  const { sessions, setSessions, reload } = useSessions(onError);
  // Все сессии стримятся одинаково: подагент шлёт свои сигналы в эту же шину
  // (`POST /v1/sessions/{id}/ingest`), клиент не знает, где шёл процесс.
  const childSession = Boolean(sessions.find((s) => s.id === active)?.parent);
  const { msgs, setMsgs, live, running, runId, steps, approval, decide } = useTranscript({
    active,
    showRecall,
    onError,
  });
  const { hits, searching } = useSearch(query, onError);

  const rail = useResize("snens-rail-w", 248, 176, 420, 1);
  const dock = useResize("snens-dock-w", 360, 240, 960, -1);

  /** Тулы журнала, перекрытые живыми: правила — в `lenta.ts`, здесь только мемо. */
  const tools = useMemo(() => collectTools(msgs, live, Boolean(active)), [active, msgs, live]);
  /** Раскладка ленты (что видно, что свёрнуто) — тоже `lenta.ts`. */
  const blocks = useMemo(() => buildBlocks(msgs, tools), [msgs, tools]);
  const ctx = useContextWindow(active, msgs.length, running, steps);
  const { feedRef, buttonRef: toBottomRef, toBottom } = useFeedScroll([msgs, live, active]);

  const turns = msgs.filter((m) => m.role !== "tool").length;
  const current = sessions.find((s) => s.id === active);
  const parent = current?.parent ? sessions.find((s) => s.id === current.parent) : undefined;
  const roots = sessions.filter((s) => !s.parent).length;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Без `?session=` показываем приветствие, а не первую сессию: выбор
      // сессии — явное действие человека (или ссылка), не догадка клиента.
      const [, m] = await Promise.all([reload(), api.model().catch(() => null)]);
      if (!alive) return;
      if (m) setModel(m.model);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  // Заголовок вкладки — заголовок сессии: в списке вкладок браузера видно, где
  // что, без переключения.
  useEffect(() => {
    document.title = current?.title ? `${current.title} — snens` : "snens";
  }, [current?.title]);

  /** Выбор сессии в рельсе: закрыть шторку, снять поиск. Историю не растим. */
  function pick(id: string | null) {
    select(id);
    setRailOpen(false);
    setQuery("");
    ctx.reset();
  }

  /**
   * Открыть сессию подагента: пишем в историю браузера, чтобы «назад» (или
   * стрелка в топбаре) вернула к родителю, а не в начало приложения.
   */
  function openChild(id: string) {
    push(id);
    setRailOpen(false);
    setQuery("");
    ctx.reset();
  }

  async function send() {
    const text = draft.trim();
    if (!text && pending.length === 0) return;
    setError(null);
    try {
      // Сессия создаётся только когда есть что отправить: пустых сессий в
      // списке быть не должно.
      let id = active;
      if (!id) {
        const created = await api.create("web");
        id = created.id;
        select(id);
        setSessions((prev) => [created, ...prev]);
      }
      const ids: string[] = [];
      for (const file of pending) {
        const up = await api.upload(id, file.file);
        ids.push(up.attachment_id);
      }
      await api.send(id, text, ids);
      setDraft("");
      setPending([]);
      const h = await api.history(id, showRecall);
      setMsgs(h.messages);
      reload();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  /** Новая сессия: экран приветствия, а не пустая запись в журнале. */
  function newSession() {
    pick(null);
    setDraft("");
    setPending([]);
  }

  async function removeSession(id: string) {
    try {
      await api.remove(id);
      setSessions((prev: SessionInfo[]) => prev.filter((s) => s.id !== id));
      setRemoving(null);
      if (active === id) pick(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  function attach(files: FileList | null) {
    if (!files) return;
    setPending((prev) => [...prev, ...Array.from(files).map((file) => ({ file, id: uuid() }))]);
  }

  return (
    <div
      className="app"
      style={{ "--rail-w": `${rail.size}px`, "--dock-w": `${dock.size}px` } as React.CSSProperties}
    >
      <Rail
        sessions={sessions}
        active={active}
        query={query}
        setQuery={setQuery}
        hits={hits}
        searching={searching}
        removing={removing}
        setRemoving={setRemoving}
        onPick={pick}
        onNew={newSession}
        onRemove={removeSession}
        onClose={() => setRailOpen(false)}
        theme={theme}
        setTheme={setTheme}
        settings={settings}
        setSettings={setSettings}
        onError={onError}
        open={railOpen}
      />

      <div className="grip grip--rail" title="тяни · двойной клик — сброс" {...rail.gripProps} />

      <main className="main">
        <Topbar
          current={current}
          parentTitle={parent?.title}
          running={running || (childSession && current?.state === "running")}
          canStop={Boolean(active && runId)}
          onStop={() => active && runId && api.stop(active, runId).catch((e) => onError(String(e)))}
          onBurger={() => setRailOpen(true)}
          onDock={() => setDockOpen(true)}
          onBack={back}
        />

        <div className="feed" ref={feedRef}>
          {loading && <div className="msg msg--system">загрузка…</div>}
          {!loading && !active && (
            <Hello
              model={model}
              sessions={roots}
              agents={sessions.length - roots}
            />
          )}
          {!loading && active && msgs.length === 0 && <EmptySession />}
          {active && (
            <Feed
              session={active}
              blocks={blocks}
              live={live}
              approval={approval}
              onDecide={decide}
              error={error}
              onDismissError={() => setError(null)}
            />
          )}
          <button
            ref={toBottomRef}
            className="feed__bottom"
            data-show="false"
            onClick={toBottom}
            aria-label="в конец ленты"
          >
            ↓
          </button>
        </div>

        <Composer
          draft={draft}
          setDraft={setDraft}
          pending={pending}
          onAttach={attach}
          onDetach={(id) => setPending((prev) => prev.filter((x) => x.id !== id))}
          onSend={send}
        />

        <Statusbar
          model={model}
          current={current}
          turns={turns}
          tools={tools.length}
          running={running}
        />
      </main>

      <div className="grip grip--dock" title="тяни · двойной клик — сброс" {...dock.gripProps} />

      <aside className="dock" aria-label="dock">
        {active && <ContextWindow breakdown={ctx.breakdown} limit={ctx.limit} />}
        <Dock tab={dockTab} setTab={setDockTab} tools={tools} session={active ?? ""}>
          <Agents sessions={sessions} active={active} onPick={openChild} />
        </Dock>
      </aside>

      <aside className="dock dock--sheet" data-open={dockOpen} aria-label="dock">
        {dockOpen && (
          <>
            {active && <ContextWindow breakdown={ctx.breakdown} limit={ctx.limit} />}
            <Dock
              tab={dockTab}
              setTab={setDockTab}
              tools={tools}
              session={active ?? ""}
              onClose={() => setDockOpen(false)}
            >
              <Agents sessions={sessions} active={active} onPick={openChild} />
            </Dock>
          </>
        )}
      </aside>
    </div>
  );
}
