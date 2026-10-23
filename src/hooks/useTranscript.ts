import { useCallback, useEffect, useState } from "react";
import { api, subscribe, type TranscriptMessage, type SurfaceEvent } from "../api";
import { applyEvent, type LiveItem } from "../lenta";

export interface Approval {
  id: string;
  command: string;
  cwd: string;
}

type Options = {
  active: string | null;
  /** Галочка «показывать справку памяти»: меняет запрос истории. */
  showRecall: boolean;
  onError: (e: string) => void;
};

/**
 * Транскрипт выбранной сессии: история из журнала + SSE-поток поверх неё.
 * Живая лента — один массив, порядок вставки = хронология (правила в `lenta.ts`).
 *
 * Состояние привязано к `sid`: при переключении сессии старое не показывается
 * ни кадра. Так сброс не нужен, а значит нет и синхронного setState в эффекте.
 */
export function useTranscript({ active, showRecall, onError }: Options) {
  const [snap, setSnap] = useState<{
    sid: string;
    msgs: TranscriptMessage[];
    live: LiveItem[];
    queued: TranscriptMessage[];
  }>({ sid: "", msgs: [], live: [], queued: [] });
  const [apr, setApr] = useState<{ sid: string; value: Approval | null }>({ sid: "", value: null });
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  /** Сколько шагов модели закончилось в этом ходе: по нему обновляется окно контекста. */
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    if (!active) return;
    const sid = active;
    let closed = false;
    let stop: (() => void) | undefined;
    /** Правка снапшота только текущей сессии: поздний ответ прошлой отбрасываем. */
    const patch = (
      f: (s: { msgs: TranscriptMessage[]; live: LiveItem[]; queued: TranscriptMessage[] }) =>
        Partial<{ msgs: TranscriptMessage[]; live: LiveItem[]; queued: TranscriptMessage[] }>,
    ) => setSnap((prev) => (prev.sid === sid ? { ...prev, ...f(prev) } : prev));

    (async () => {
      try {
        const h = await api.history(sid, showRecall);
        if (closed) return;
        setSnap({ sid, msgs: h.messages, live: [], queued: [] });
        setApr({ sid, value: null });
        // ?nostream=1 — статичный снимок истории без SSE (скриншоты, отладка)
        if (new URLSearchParams(location.search).has("nostream")) return;

        stop = subscribe(sid, h.cursor, (e: SurfaceEvent) => {
          switch (e.type) {
            case "run.started":
              setRunning(true);
              setRunId(e.run_id ?? null);
              patch(() => ({ live: [] }));
              break;            // Шаг завершён: расход посчитан, окно контекста устарело.
            case "usage":
              setSteps((n) => n + 1);
              patch((s) => ({ live: applyEvent(s.live, e) }));
              break;
            case "assistant.delta":
            case "tool.started":
            case "tool.completed":
              // Одна функция на все три типа: правило «приклеить или открыть
              // новый блок» живёт в `applyEvent`, а не в обработчике.
              patch((s) => ({ live: applyEvent(s.live, e) }));
              break;
            case "approval.requested":
              setApr({
                sid,
                value: {
                  id: String(e.approval_id ?? ""),
                  command: String(e.command ?? ""),
                  cwd: String(e.cwd ?? ""),
                },
              });
              break;
            case "approval.resolved":
              setApr((a) =>
                a.sid === sid && a.value && a.value.id === String(e.approval_id ?? "")
                  ? { ...a, value: null }
                  : a,
              );
              break;
            case "run.finished": {
              setRunning(false);
              setRunId(null);
              const status = String(e.status ?? "");
              if (status !== "ok" && e.error) onError(`${status}: ${e.error}`);
              // Канонический транскрипт — из журнала. Лента истории собирается
              // тем же правилом, что и живая (хронология по записям), поэтому
              // переход «стрим → история» больше не переставляет блоки.
              // Провизорная реплика и пометка «передан агенту» снимаются: их
              // место занял журнал.
              api
                .history(sid)
                .then((x) => {
                  if (!closed) setSnap({ sid, msgs: x.messages, live: [], queued: [] });
                })
                .catch((err) => onError(String(err instanceof Error ? err.message : err)));
              break;
            }
          }
        });
      } catch (e) {
        onError(String(e instanceof Error ? e.message : e));
      }
    })();

    return () => {
      closed = true;
      stop?.();
    };
    // `showRecall` в зависимостях: включение галочки перезапрашивает историю,
    // иначе справка памяти появилась бы только у следующих ходов.
  }, [active, showRecall, onError]);

  /** Руками подложить свежую историю (после отправки сообщения). */
  const setMsgs = useCallback(
    (msgs: TranscriptMessage[]) => {
      if (!active) return;
      setSnap((prev) => (prev.sid === active ? { ...prev, msgs } : prev));
    },
    [active],
  );

  /**
   * Показать отправленное до того, как оно попало в журнал.
   *
   * Ядро принимает сообщение в очередь к идущему ходу (`accepted`), и в лог оно
   * уезжает только на границе хода — а если агент ждёт подагентов, то и через
   * десятки минут. Без провизорной реплики человек видит пустую ленту сразу после
   * отправки и отправляет ещё раз. Когда журнал перечитается, провизорные уйдут.
   */
  const addQueued = useCallback(
    (text: string) => {
      if (!active) return;
      const m: TranscriptMessage = {
        seq: -Date.now(),
        ts: Math.floor(Date.now() / 1000),
        role: "user",
        content: text,
        source: "surface",
      };
      setSnap((prev) =>
        prev.sid === active ? { ...prev, queued: [...prev.queued, m] } : prev,
      );
    },
    [active],
  );

  const approval = apr.sid === active ? apr.value : null;

  const decide = useCallback(
    async (allow: boolean) => {
      if (!approval || !active) return;
      try {
        await api.approve(active, approval.id, allow);
        setApr((a) => ({ ...a, value: null }));
      } catch (e) {
        onError(String(e instanceof Error ? e.message : e));
      }
    },
    [active, approval, onError],
  );

  const same = snap.sid === active;
  const pending = same ? snap.queued : [];
  return {
    // Провизорные реплики встают в конец ленты: это то, чего у агента ещё нет в
    // журнале — и по смыслу они хронологически последние.
    msgs: same ? [...snap.msgs, ...snap.queued] : [],
    setMsgs,
    addQueued,
    pending,
    live: same ? snap.live : [],
    running,
    runId,
    steps,
    approval,
    decide,
  };
}
