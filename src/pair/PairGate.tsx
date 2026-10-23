import type { ReactNode } from "react";
import { connection, hasProxy } from "../lib/connection.ts";
import { PairScreen } from "./PairScreen.tsx";

/**
 * Вход в приложение: либо лента, либо экран подключения.
 *
 * Отдельный компонент, а не `if` в начале `App`: у `App` больше десятка хуков
 * наверху, а возврат раньше них — нарушение порядка хуков (и `rules-of-hooks`
 * справедливо ругался). Здесь вся развилка — в одном месте, до первого хука.
 *
 * Когда показывать форму: соединения нет И на странице нет vite-прокси `/api`.
 * В dev-режиме и в прод-вебе (оба под `vite`) прокси есть, клиент работает как
 * раньше, и человеку не предлагают пейрить то, что уже работает.
 */
export function PairGate({ children }: { children: ReactNode }) {
  if (connection().conn || hasProxy()) return <>{children}</>;
  return (
    <PairScreen
      onPaired={() => {
        // Перезагрузка, а не setState: `connection()` кэширует решение на старте
        // модуля, и уже смонтированные подписки SSE остались бы на старом адресе.
        location.reload();
      }}
    />
  );
}
