import { useCallback, useEffect, useState } from "react";
import { api, subscribeSessions, type SessionInfo } from "../api";

/**
 * Список сессий: порядок приходит с ядра (по mtime лога), клиент не сортирует.
 *
 * Живость: `GET /v1/events` шлёт готовую запись сессии на каждое её изменение
 * (старт/конец хода, события подагента). Клиент делает upsert по id — опроса нет,
 * и карточка работающего подагента не висит «ждёт» до перезагрузки страницы.
 */
export function useSessions(onError: (e: string) => void) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  const reload = useCallback(async (): Promise<SessionInfo[]> => {
    try {
      const { sessions } = await api.sessions();
      // Порядок приходит с ядра (по mtime лога) — поверхность и форма id на него
      // не влияют. Клиентская сортировка только дублировала бы правила.
      setSessions(sessions);
      return sessions;
    } catch (e) {
      onError(String(e instanceof Error ? e.message : e));
      return [];
    }
  }, [onError]);

  useEffect(() => {
    // Ошибку потока не показываем: EventSource переподключается сам, а данные
    // не теряются — полный список приходит на старте и при смене сессии.
    return subscribeSessions((s) => {
      setSessions((prev) => {
        const i = prev.findIndex((x) => x.id === s.id);
        if (i === -1) return [s, ...prev];
        const next = prev.slice();
        next[i] = { ...prev[i], ...s };
        return next;
      });
    });
  }, []);

  return { sessions, setSessions, reload };
}
