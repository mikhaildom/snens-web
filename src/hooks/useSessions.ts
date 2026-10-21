import { useCallback, useState } from "react";
import { api, type SessionInfo } from "../api";

/** Список сессий: порядок приходит с ядра (по mtime лога), клиент не сортирует. */
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

  return { sessions, setSessions, reload };
}
