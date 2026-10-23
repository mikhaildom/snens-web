import { useEffect, useState } from "react";
import { apiUrl, authHeaders, connection } from "../lib/connection.ts";
import { fileUrl } from "../lib/format.ts";

/**
 * Адрес файла сессии для `<img>/<video>/<audio>`.
 *
 * Браузер запрашивает медиа сам, без наших заголовков, а токен в query ядро
 * принимает ТОЛЬКО на потоковых GET (`?token=` для SSE). На `/v1/sessions/{id}/file`
 * такой запрос отвечает 401 — проверено на живом ядре.
 *
 * Отсюда два пути:
 *  - proxy-режим: `<img src="/api/...">` как раньше, Bearer ставит dev-сервер;
 *  - прямое подключение: качаем файл `fetch`-ем с `Authorization` и отдаём
 *    `blob:`-ссылку. Цена — файл целиком в памяти и нет range-запросов у видео;
 *    альтернатива (токен в URL медиа) требует правки ядра, и это записано в
 *    отчёте как пожелание: расширить `is_stream_path` на `/file` — тогда хук
 *    схлопнется в одну строку `fileUrl`.
 *
 * `null` — ещё не готово: компонент просто не рисует источник.
 */
export function useFileSrc(session: string, path: string): string | null {
  const conn = connection().conn;
  /** Ключ файла: по нему видно, что blob относится к текущему `path`. */
  const key = `${session}\u0000${path}`;
  const [got, setGot] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    // В proxy-режиме источник — обычный относительный URL, грузить нечего.
    if (!conn) return;
    let alive = true;
    let made: string | null = null;
    const url = apiUrl(`/v1/sessions/${session}/file?path=${encodeURIComponent(path)}`, conn);
    fetch(url, { headers: authHeaders(conn) })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!alive || !b) return;
        made = URL.createObjectURL(b);
        setGot({ key, url: made });
      })
      // Файла нет/токен отозван — молчим: пустая картинка не должна валить ленту.
      .catch(() => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [conn, session, path, key]);

  if (!conn) return fileUrl(session, path);
  // Blob от предыдущего `path` не показываем: иначе при листании лайтбокса
  // на мгновение мелькал бы чужой кадр.
  return got?.key === key ? got.url : null;
}
