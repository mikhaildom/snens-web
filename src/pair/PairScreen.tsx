import { useState } from "react";
import { claim, validatePair } from "./claim.ts";
import { clearConnection, hostOf, saveConnection, type Connection } from "../lib/connection.ts";
import { forgetShellRemote, inShell, isRemote, pairShell, reloadShell } from "../lib/shell.ts";

/**
 * Экран подключения к ядру: адрес, код пейринга, имя устройства.
 *
 * Показывается только когда прямого соединения нет И страница не под vite-прокси
 * (`App` решает это по `connection()`/`hasProxy`). Почему не «всегда, если нет
 * соединения»: в dev-режиме соединения и не должно быть — клиент ходит на
 * относительный `/api`, и форма требовала бы от человека пейрить то, что уже
 * работает.
 *
 * Токен здесь единственный раз проходит через JS страницы — это цена браузерного
 * пейринга. В десктоп-оболочке его хранит `window.__SNENS__`, а не localStorage.
 */
export function PairScreen({ onPaired }: { onPaired?: () => void }) {
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem("snens-pair-host") ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("Браузер");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Проверка ввода — до сети: `claim` вернёт ту же ошибку, но мгновенно
    // отвечать человеку приятнее, чем после таймаута.
    const problem = validatePair({ baseUrl, code, name });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const out = await claim({ baseUrl, code, name });
    setBusy(false);
    if (!out.ok) {
      setError(out.error);
      return;
    }
    // Адрес запоминаем отдельно от соединения: он не секрет, и в следующий раз
    // (после «отключиться») человеку не придётся набирать его заново.
    localStorage.setItem("snens-pair-host", out.conn.baseUrl);
    // В окне приложения соединение хранит оболочка (у неё защищённое хранилище
    // ОС и право не поднимать своё ядро при следующем запуске). localStorage
    // здесь был бы вторым, конкурирующим источником правды — и после
    // перезапуска окно подняло бы своё ядро, проигнорировав пейринг.
    if (inShell()) {
      const problem = await pairShell(out.conn.baseUrl, out.conn.token);
      if (problem) {
        setError(problem);
        return;
      }
      // Окно пересоздаётся оболочкой: `window.__SNENS__` инжектится при
      // создании окна, и обычный reload оставил бы старый адрес.
      const reload = await reloadShell();
      if (reload) setError(reload);
      return;
    }
    saveConnection(out.conn);
    // Перезагрузка, а не setState: соединение кэшируется на старте модуля
    // (`connection()`), и половина уже смонтированных подписок смотрела бы на
    // старый адрес. Полный перезапуск приложения — честный переход. В окне
    // оболочки ветка выше: там перезагрузки страницы недостаточно.
    if (onPaired) onPaired();
    else location.reload();
  }

  return (
    <form className="pair" onSubmit={submit} aria-busy={busy}>
      <div className="pair__mark">snens</div>
      <p className="pair__lead">
        Ядро на другой машине? Запусти там <code>snens pair</code> и введи адрес с
        кодом
      </p>

      <label className="pair__row">
        <span>Адрес ядра</span>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://100.73.69.107:7420"
          autoComplete="url"
          spellCheck={false}
          disabled={busy}
        />
      </label>

      <label className="pair__row">
        <span>Код пейринга</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123-456"
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={busy}
        />
      </label>

      <label className="pair__row">
        <span>Имя устройства</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ноутбук"
          disabled={busy}
        />
      </label>

      {error && (
        <div className="pair__error" role="alert">
          {error}
        </div>
      )}

      <button className="solid pair__submit" type="submit" disabled={busy}>
        {busy ? "Подключаюсь…" : "Подключиться"}
      </button>
    </form>
  );
}

/**
 * Строка состояния соединения: «подключено к <host>» и «отключиться».
 *
 * Живёт в подвале настроек, а не в топбаре: это редкое действие, и постоянная
 * плашка в шапке отнимала бы место у заголовка сессии. `proxy` показываем
 * отличимо от прямого подключения: там токен живёт в dev-сервере, и «отключиться»
 * нечего.
 */
export function ConnectionBar({
  conn,
  source,
  onChanged,
  onError,
}: {
  conn: Connection | null;
  source: "injected" | "stored" | "proxy";
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  return (
    <div className="conn">
      <div className="conn__where">
        {conn ? (
          <>
            Подключено к <b>{hostOf(conn)}</b>
            <small>
              {source === "injected"
                ? isRemote()
                  ? "Чужое ядро: окно подключено пейрингом"
                  : "Своё ядро: поднято вместе с окном"
                : "Токен устройства из пейринга, живёт в этом браузере"}
            </small>
          </>
        ) : (
          <>
            Локальный <b>/api</b>
            <small>Адрес и токен подставляет dev-сервер</small>
          </>
        )}
      </div>
      {source === "stored" && (
        <button
          className="conn__off"
          onClick={() => {
            clearConnection();
            onChanged();
          }}
        >
          Отключиться
        </button>
      )}
      {/* Окно приложения: оба направления переключения. Правит не localStorage,
          а оболочка, и вступает в силу сразу — она пересоздаёт окно. */}
      {source === "injected" && inShell() && <ShellSwitch onError={onError} />}
      {source === "injected" && !inShell() && (
        <span className="conn__note">Меняется в окне приложения</span>
      )}
    </div>
  );
}

/**
 * Переключение ядра из окна приложения: подключиться к чужому или вернуться к
 * своему.
 *
 * Форма пейринга — та же, что на экране входа: логика обмена кода уже живёт в
 * `PairScreen`, второй её копии быть не должно. Здесь только выбор направления
 * и пояснение цены: своё ядро живёт на этой машине и видит её файлы, чужое — нет.
 */
function ShellSwitch({ onError }: { onError: (e: string) => void }) {
  const [pairing, setPairing] = useState(isRemote());
  const remote = isRemote();

  if (pairing) {
    return (
      <div className="conn__pair">
        <PairScreen
          onPaired={() => {
            /* оболочка сама пересоздаёт окно — см. PairScreen */
          }}
        />
        {remote && (
          <button className="conn__off" onClick={() => setPairing(false)}>
            Отмена
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="conn__actions">
      {remote ? (
        <button
          className="conn__off"
          title="Своё ядро поднимется при следующем запуске окна"
          onClick={async () => {
            const problem = await forgetShellRemote();
            if (problem) {
              onError(problem);
              return;
            }
            const reload = await reloadShell();
            if (reload) onError(reload);
          }}
        >
          Вернуться к своему ядру
        </button>
      ) : (
        <button className="conn__off" onClick={() => setPairing(true)}>
          Подключить чужое ядро…
        </button>
      )}
    </div>
  );
}
