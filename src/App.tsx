import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, uuid, type AskRef, type SessionInfo } from "./api";
import { connection, surfaceLabel } from "./lib/connection";
import { buildBlocks, collectTools } from "./lenta";
import { applyTheme, initialTheme, type Theme } from "./theme";
import { applyLook, initialSettings, saveSettings, type Settings } from "./settings";
import { useResize } from "./useResize";
import { useActiveSession } from "./hooks/useActiveSession";
import { useSessions } from "./hooks/useSessions";
import { useTranscript } from "./hooks/useTranscript";
import { useContextWindow } from "./hooks/useContextWindow";
import { useSearch } from "./hooks/useSearch";
import { useFeedScroll } from "./hooks/useFeedScroll";
import { Rail } from "./rail/Rail";
import { Composer, type PendingFile } from "./composer/Composer";
import { SettingsPage } from "./settings/SettingsPage";
import { DitherField } from "./feed/DitherField";
import { WorkWave, type WaveKind } from "./feed/WorkWave";
import { agentOwner, agentTree, type AgentNode } from "./lib/agent";
import { argLabel } from "./lib/tool";
import { Icon } from "./ui/icons";
import { ApprovalBar, EmptySession, Feed, Hello } from "./feed/Feed";
import { Agents } from "./dock/Agents";
import { ContextWindow } from "./dock/ContextWindow";
import { Dock, type DockTab } from "./dock/Dock";
import { Dashboard } from "./dashboard/Dashboard";
import type { Artifact } from "./lib/artifact";
import type { ArtifactAnswer } from "./feed/Artifact";

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
  const [railOpen, setRailOpen] = useState(false);
  const [dockOpen, setDockOpenRaw] = useState(
    () => new URLSearchParams(location.search).has("dock") || localStorage.getItem("snens-dock-open") === "1",
  );
  const setDockOpen = useCallback((v: boolean) => {
    setDockOpenRaw(v);
    localStorage.setItem("snens-dock-open", v ? "1" : "0");
  }, []);
  /** Настройки — вкладка вместо чата (`?settings`), как и дашборд. */
  const [settingsOpen, setSettingsOpen] = useState(() => new URLSearchParams(location.search).has("settings"));
  const [settingsPane, setSettingsPane] = useState<"view" | "models">("view");
  const [railMini, setRailMini] = useState(() => localStorage.getItem("snens-rail-mini") === "1");
  const [dockMin, setDockMin] = useState(240);
  /**
   * Дашборд — страница приложения (`?dash=1`), а не модалка: у него свой
   * скролл, свои фильтры и возврат к ленте. В URL — чтобы ссылка на вид
   * тикетов переживала перезагрузку, как `?dock` и `?settings`.
   */
  const [dashOpen, setDashOpen] = useState(() => new URLSearchParams(location.search).has("dash"));
  // `?tab=windows` открывает док сразу на подагентах: без этого скриншот дока
  // требует сначала клика, а `shot --selector` со скриптом не совмещается.
  const [dockTab, setDockTab] = useState<DockTab>(() => {
    const t = new URLSearchParams(location.search).get("tab");
    return t === "tools" ? "tools" : t === "ctx" ? "ctx" : "agents";
  });
  /** Файлы, приложенные к ещё не отправленному сообщению. */
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** Сессия, у которой открыто подтверждение удаления. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { active, select, push, back } = useActiveSession();
  const { sessions, setSessions, reload } = useSessions(onError);
  // Все сессии стримятся одинаково: подагент шлёт свои сигналы в эту же шину
  // (`POST /v1/sessions/{id}/ingest`), клиент не знает, где шёл процесс.
  const { msgs, setMsgs, addQueued, live, running, runId, steps, approval, decide } =
    useTranscript({
      active,
      showRecall,
      onError,
    });  const { hits, searching } = useSearch(query, onError);

  const rail = useResize("snens-rail-w2", 232, 180, 420, 1);
  const dock = useResize("snens-dock-w2", 420, 240, 960, -1);

  /**
   * Ключи уже отвеченных вопросов: `seq:artifact:id`. Строится из журнала, а не
   * из состояния интерфейса, поэтому переживает перезагрузку окна и второй
   * клиент: ядро всё равно ответит `409`, а лента не должна предлагать выбирать
   * заново.
   */
  const answered = useMemo(() => {
    const out = new Set<string>();
    for (const m of msgs) {
      if (m.ask) out.add(`${m.ask.seq}:${m.ask.artifact}:${m.ask.id}`);
    }
    return out;
  }, [msgs]);

  /** Тулы журнала, перекрытые живыми: правила — в `lenta.ts`, здесь только мемо. */
  const tools = useMemo(() => collectTools(msgs, live, Boolean(active)), [active, msgs, live]);
  /** Раскладка ленты (что видно, что свёрнуто) — тоже `lenta.ts`. */
  const blocks = useMemo(() => buildBlocks(msgs, tools), [msgs, tools]);
  const ctx = useContextWindow(active, msgs.length, running, steps);
  const { feedRef, buttonRef: toBottomRef, toBottom } = useFeedScroll([msgs, live, active]);

  const current = sessions.find((s) => s.id === active);
  const page: "chat" | "tickets" | "settings" = dashOpen ? "tickets" : settingsOpen ? "settings" : "chat";
  // Состояние из списка сессий — правда ядра: если оно говорит «idle», ход
  // закончен, даже когда событие конца хода до ленты не дошло (обрыв SSE).
  const busy =
    (running && current?.state !== "idle") || current?.state === "running" || current?.state === "stopping";

  /** Подагенты открытой сессии (или её рабочей группы): число для вкладки и кнопки. */
  const agentCount = useMemo(() => {
    const owner = agentOwner(sessions, active);
    if (!owner) return 0;
    const count = (ns: AgentNode[]): number => ns.reduce((n, x) => n + 1 + count(x.children), 0);
    return count(agentTree(sessions, owner));
  }, [sessions, active]);

  /** Вкладка тикетов забирает фокус один раз при открытии: так работает Esc. */
  const focusPage = useCallback((el: HTMLDivElement | null) => {
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);

  /** Начало хода — для таймера рядом с волной. */
  const [runSince, setRunSince] = useState(0);
  useEffect(() => {
    if (busy) setRunSince((v) => v || Date.now());
    else setRunSince(0);
  }, [busy]);
  const lastLive = live[live.length - 1];
  const runningTool = tools.find((t) => t.state === "running");
  const wave: { kind: WaveKind; label: string } | null = !busy
    ? null
    : approval
      ? { kind: "wait", label: "Ждёт подтверждения" }
      : runningTool
        ? { kind: "tool", label: `${runningTool.name} ${argLabel(runningTool)}` }
        : lastLive?.kind === "text"
          ? { kind: "think", label: "Пишет" }
          : { kind: "think", label: "Думает" };
  const ctxPct = ctx.breakdown && ctx.limit > 0 ? Math.min(100, (ctx.breakdown.total / ctx.limit) * 100) : null;
  const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const parent = current?.parent ? sessions.find((s) => s.id === current.parent) : undefined;

  // Кнопки браузера меняют адрес — забираем из него признак дашборда, как это
  // делает `useActiveSession` для сессии.
  useEffect(() => {
    const onPop = () => setDashOpen(new URLSearchParams(location.search).has("dash"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveSettings(settings);
    applyLook(settings);
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
  // что, без переключения. В окне десктоп-оболочки хвост «— snens» лишний (там
  // и так одно приложение на всё окно), вместо него — пометка поверхности:
  // скриншот или переключение окон не должны путать десктоп с браузером.
  useEffect(() => {
    const surface = surfaceLabel(connection().source);
    document.title = current?.title
      ? surface === "desktop"
        ? `${current.title}, desktop`
        : `${current.title} — snens`
      : "snens";
  }, [current?.title]);

  /**
   * Открыть дашборд: `pushState` — возврат («назад» или кнопка в дашборде)
   * должен вести к ленте, а не в начало приложения. Текущая лента остаётся
   * живой под страницей: уход с неё не рвёт SSE — компонент просто скрыт.
   */
  function openSettings(pane: "view" | "models" = "view") {
    if (dashOpen) closeDashboard();
    setSettingsPane(pane);
    setSettingsOpen(true);
    setRailOpen(false);
  }
  function closeSettings() {
    setSettingsOpen(false);
    const url = new URL(location.href);
    if (url.searchParams.has("settings")) {
      url.searchParams.delete("settings");
      history.replaceState(history.state, "", url);
    }
  }

  function openDashboard() {
    setSettingsOpen(false);
    setRailOpen(false);
    const url = new URL(location.href);
    url.searchParams.set("dash", "1");
    history.pushState({ ...(history.state ?? {}), dash: true }, "", url);
    setDashOpen(true);
  }

  /** Закрыть дашборд: шаг назад по истории, а не своя отмена состояния. */
  function closeDashboard() {
    const url = new URL(location.href);
    if (history.state?.dash) {
      history.back();
      return;
    }
    // Пришли по прямой ссылке (?dash=1) — шага назад нет, чистим адрес сами.
    url.searchParams.delete("dash");
    history.replaceState(history.state, "", url);
    setDashOpen(false);
  }

  /**
   * Переход из дашборда в сессию: дашборд закрываем, но `dashTab` в адресе
   * оставляем — «назад» вернёт на ту же вкладку, а не на «тикеты».
   * Снимаем только сам признак страницы, до `push` истории: иначе запись
   * сессии утащила бы `?dash=1` за собой и лента осталась бы скрытой.
   */
  function openSessionFromDashboard(id: string) {
    const url = new URL(location.href);
    url.searchParams.delete("dash");
    history.replaceState(history.state, "", url);
    setDashOpen(false);
    openChild(id);
  }

  /** Выбор сессии в рельсе: закрыть шторку, снять поиск. Историю не растим. */
  function pick(id: string | null) {
    if (dashOpen) closeDashboard();
    closeSettings();
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

  /** Ответвить текущую сессию от ответа `seq` и сразу перейти в ответвление. */
  async function fork(seq: number) {
    if (!active) return;
    setError(null);
    try {
      const created = await api.fork(active, seq);
      setSessions((prev) => (prev.some((x) => x.id === created.id) ? prev : [created, ...prev]));
      pick(created.id);
      reload();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  // Лента под `memo`: обработчик ответвления должен быть один и тот же.
  const forkRef = useRef(fork);
  forkRef.current = fork;
  const onFork = useCallback((seq: number) => forkRef.current(seq), []);

  async function send(text: string): Promise<boolean> {
    if (!text.trim() && pending.length === 0) return false;
    setError(null);
    try {
      // Сессия создаётся только когда есть что отправить: пустых сессий в
      // списке быть не должно.
      let id = active;
      if (!id) {
        const created = await api.create("web");
        id = created.id;
        select(id);
        setSessions((prev) => (prev.some((x) => x.id === created.id) ? prev : [created, ...prev]));
      }
      const ids: string[] = [];
      for (const file of pending) {
        const up = await api.upload(id, file.file);
        ids.push(up.attachment_id);
      }
      const reply = await api.send(id, text, ids);
      setPending([]);
      // Сообщение попало в очередь к идущему ходу: в журнале его ещё нет, и
      // человека надо об этом сказать — иначе он решит, что отправка не прошла.
      if (reply.state === "accepted") addQueued(text);
      const h = await api.history(id, showRecall);
      setMsgs(h.messages);
      reload();
      return true;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return false;
    }
  }

  /**
   * Ответ человека на вопрос артефакта (`snens.ask`).
   *
   * Уезжает обычным сообщением сессии с `source: "artifact"`: для ядра это
   * такое же слово человека, как набранное руками, — и это правильно, потому
   * что модель уже закончила ход и ждёт нового. Ссылка на артефакт едет полем
   * `ask`: по ней ядро отвергает повтор (`409 ask_answered`), а лента рисует
   * серую строку вместо реплики.
   *
   * `scope` — `seq` записи с артефактом; пусто (артефакт из стрима, ещё без
   * записи в журнале) — отвечать рано, и такого вопроса в ленте не бывает:
   * живой ход не принимает ответы артефактов до своего завершения.
   */
  async function answer(art: Artifact, ans: ArtifactAnswer, scope: string): Promise<boolean> {
    if (!active || !scope) return false;
    const seq = Number(scope);
    if (!Number.isFinite(seq) || seq <= 0) return false;
    const ref: AskRef = {
      seq,
      artifact: art.id,
      id: ans.id,
      question: ans.question,
    };
    try {
      const reply = await api.send(active, ans.value, [], ref);
      // `accepted` — ответ лёг в очередь к идущему ходу: в журнале его ещё нет,
      // и провизорной реплики тоже не будет (она была бы оранжевой репликой
      // человека, а тут серая строка). Историю всё равно перечитываем: когда
      // ход закончится, ответ появится сам.
      if (reply.state !== "accepted") {
        const h = await api.history(active, showRecall);
        setMsgs(h.messages);
      }
      reload();
      return true;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return false;
    }
  }

  /** Новая сессия: экран приветствия, а не пустая запись в журнале. */
  function newSession() {
    pick(null);
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

  function detach(id: string) {
    setPending((prev) => prev.filter((x) => x.id !== id));
  }

  const dockShown = dockOpen && page === "chat";
  const dockW = Math.max(dock.size, dockMin);
  return (
    <div
      className="app"
      data-rail={railMini ? "mini" : "full"}
      data-dock={dockShown ? "open" : "closed"}
      data-mob={railOpen ? "open" : "closed"}
      style={{ "--rail-w": `${rail.size}px`, "--dock-w": `${dockW}px` } as React.CSSProperties}
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
        open={railOpen}
        mini={railMini}
        onToggleMini={() => {
          setRailMini((v) => {
            localStorage.setItem("snens-rail-mini", v ? "0" : "1");
            return !v;
          });
        }}
        page={page}
        onTickets={() => (dashOpen ? closeDashboard() : openDashboard())}
        onSettings={() => (settingsOpen ? closeSettings() : openSettings())}
      />
      {!railMini && <div className="rz rz-rail" title="Тяни, чтобы изменить ширину. Двойной клик вернёт как было" {...rail.gripProps} />}

      <main className="main" data-hello={page === "chat" && !loading && !active}>
        <DitherField on={page === "chat" && !loading && !active} form={settings.form} />

        {dashOpen && (
          <div
            className="page page--tix"
            tabIndex={-1}
            ref={focusPage}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !e.defaultPrevented) {
                e.preventDefault();
                closeDashboard();
              }
            }}
          >
            <Dashboard onClose={closeDashboard} onOpenSession={openSessionFromDashboard} onError={onError} sessions={sessions} />
          </div>
        )}
        {settingsOpen && (
          <SettingsPage
            theme={theme}
            setTheme={setTheme}
            settings={settings}
            setSettings={setSettings}
            onError={onError}
            onClose={closeSettings}
            initial={settingsPane}
          />
        )}

        {current?.parent && page === "chat" && (
          <button className="crumb" onClick={back} title={parent?.title ? `К «${parent.title}»` : "Назад"}>
            <Icon name="back" />
            К основной сессии
          </button>
        )}

        <div className="feed" ref={feedRef} data-hidden={page !== "chat"}>
          <div className="col">
            {loading && <div className="msg msg--system">Загрузка…</div>}
            {!loading && !active && <Hello model={model} onModel={() => openSettings("models")} />}
            {!loading && active && msgs.length === 0 && !busy && <EmptySession />}
            {active && (
              <Feed
                session={active}
                blocks={blocks}
                live={live}
                approval={approval}
                onDecide={decide}
                error={error}
                onDismissError={() => setError(null)}
                onAnswer={answer}
                answered={answered}
                onFork={onFork}
              />
            )}
            {active && wave && <WorkWave kind={wave.kind} label={wave.label} since={runSince || Date.now()} />}
          </div>
          <button
            ref={toBottomRef}
            className="feed__bottom ibtn"
            data-show="false"
            onClick={toBottom}
            aria-label="В конец ленты"
          >
            <Icon name="down" />
          </button>
        </div>

        <div className="foot" hidden={page !== "chat"}>
          {approval && (
            <div className="appr-wrap">
              <ApprovalBar approval={approval} onDecide={decide} />
            </div>
          )}
          <Composer
            hidden={page !== "chat"}
            resetKey={active}
            pending={pending}
            onAttach={attach}
            onDetach={detach}
            onSend={send}
            bar={{
              model: current?.model || model,
              onModel: () => openSettings("models"),
              agents: agentCount,
              onAgents: () => {
                if (dockOpen && dockTab === "agents") setDockOpen(false);
                else {
                  setDockTab("agents");
                  setDockOpen(true);
                }
              },
              ctxPct,
              ctxTitle: ctx.breakdown ? `${fmtK(ctx.breakdown.total)} из ${fmtK(ctx.limit)}` : "",
              onCtx: () => {
                if (dockOpen && dockTab === "ctx") setDockOpen(false);
                else {
                  setDockTab("ctx");
                  setDockOpen(true);
                }
              },
              running: busy,
              canStop: Boolean(active && runId),
              onStop: () => {
                if (active && runId) api.stop(active, runId).catch((e) => onError(String(e)));
              },
              onBurger: () => setRailOpen(true),
            }}
          />
        </div>
      </main>

      {dockShown && (
        <>
          <div className="rz rz-dock" title="Тяни, чтобы изменить ширину. Двойной клик вернёт как было" {...dock.gripProps} />
          <aside className="dock" aria-label="Подагенты, тулы и контекст">
            <Dock
              tab={dockTab}
              setTab={setDockTab}
              tools={tools}
              session={active ?? ""}
              agentCount={agentCount}
              agents={<Agents sessions={sessions} active={active} onPick={openChild} />}
              context={<ContextWindow breakdown={ctx.breakdown} limit={ctx.limit} />}
              onClose={() => setDockOpen(false)}
              onMinWidth={setDockMin}
            />
          </aside>
        </>
      )}
      {railOpen && <button className="mob-scrim" aria-label="Закрыть список" onClick={() => setRailOpen(false)} />}
    </div>
  );
}
