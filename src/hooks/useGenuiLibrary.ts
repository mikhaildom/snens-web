import { useEffect, useState } from "react";
import { api, type GenuiLibrary } from "../api.ts";

/**
 * Библиотека компонентов инстанса.
 *
 * Тянется один раз на страницу и держится в модуле: артефактов в ленте много, а
 * библиотека у них общая. Инжектится в каждый `srcdoc` инлайном — origin
 * песочницы `null`, и `<script src>` по сети там не загрузится.
 *
 * Библиотека всегда свежая (правка компонента меняет и старые артефакты) —
 * сознательное решение: починка чинит везде. Ключ `lib=<hash>` в заголовке
 * фенса зарезервирован на случай, если это станет проблемой.
 *
 * Ошибка загрузки не ломает ленту: артефакты без компонентов рендерятся как
 * обычно, просто пользовательские теги останутся пустыми (это увидит `genui
 * check` как «чужой тег» при следующей проверке).
 */
type Library = GenuiLibrary;

let cache: Library | null = null;
let pending: Promise<Library | null> | null = null;

function load(): Promise<Library | null> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = api
      .genui()
      .then((lib) => {
        cache = lib;
        return lib;
      })
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export interface GenuiFile {
  name: string;
  source: string;
}

export function useGenuiLibrary(): GenuiFile[] {
  const [lib, setLib] = useState<Library | null>(cache);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    load().then((v) => {
      if (alive && v) setLib(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return lib?.files ?? [];
}

/** Сбросить кэш: правка компонента должна приехать без перезагрузки окна. */
export function refreshGenuiLibrary() {
  cache = null;
  pending = null;
}
