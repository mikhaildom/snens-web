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
  const [snap, setSnap] = useState<{ sid: string; msgs: TranscriptMessage[]; live: LiveItem[] }>({
    sid: "",
    msgs: [],
    live: [],
  });
  const [apr, setApr] = useState<{ sid: string; value: Approval | null }>({ sid: "", value: null });
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const sid = active;
    let closed = false;
    let stop: (() => void) | undefined;
    /** Правка снапшота только текущей сессии: поздний ответ прошлой отбрасываем. */
    const patch = (f: (s: { msgs: TranscriptMessage[]; live: LiveItem[] }) => Partial<typeof s>) =>
      setSnap((prev) => (prev.sid === sid ? { ...prev, ...f(prev) } : prev));

    (async () => {
      try {
        const h = await api.history(sid, showRecall);
        if (closed) return;
        setSnap({ sid, msgs: h.messages, live: [] });
        setApr({ sid, value: null });
        // ?nostream=1 — статичный снимок истории без SSE (скриншоты, отладка)
        if (new URLSearchParams(location.search).has("nostream")) return;
        stop = subscribe(sid, h.cursor, (e: SurfaceEvent) => {
          switch (e.type) {
            case "run.started":
              setRunning(true);
              setRunId(e.run_id ?? null);
              patch(() => ({ live: [] }));
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
              api
                .history(sid)
                .then((x) => {
                  if (!closed) setSnap({ sid, msgs: x.messages, live: [] });
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
  return {
    msgs: same ? snap.msgs : [],
    setMsgs,
    live: same ? snap.live : [],
    running,
    runId,
    approval,
    decide,
  };
}
