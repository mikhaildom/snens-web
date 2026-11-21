/**
 * Полифилы для старых браузеров (Windows 7: Chrome/Supermium 109, Firefox ESR 115).
 *
 * `build.target` в `vite.config.ts` понижает только синтаксис, а новые
 * встроенные функции он не дописывает. `Object.groupBy` зовёт парсер langium
 * внутри mermaid (диаграммы architecture/packet и т.п.); в браузере до
 * Chrome 117 / Firefox 119 вызов падал с TypeError, и диаграмма не рисовалась.
 * В новых браузерах этот код ничего не делает: всё стоит за проверкой «уже есть».
 */

type KeyFn<T, K> = (item: T, index: number) => K;

const O = Object as unknown as {
  groupBy?: <T, K extends PropertyKey>(items: Iterable<T>, fn: KeyFn<T, K>) => Record<K, T[]>;
};
if (typeof O.groupBy !== "function") {
  O.groupBy = <T, K extends PropertyKey>(items: Iterable<T>, fn: KeyFn<T, K>) => {
    const out = Object.create(null) as Record<K, T[]>;
    let i = 0;
    for (const item of items) {
      const key = fn(item, i++);
      (out[key] ??= []).push(item);
    }
    return out;
  };
}

const M = Map as unknown as {
  groupBy?: <T, K>(items: Iterable<T>, fn: KeyFn<T, K>) => Map<K, T[]>;
};
if (typeof M.groupBy !== "function") {
  M.groupBy = <T, K>(items: Iterable<T>, fn: KeyFn<T, K>) => {
    const out = new Map<K, T[]>();
    let i = 0;
    for (const item of items) {
      const key = fn(item, i++);
      const list = out.get(key);
      if (list) list.push(item);
      else out.set(key, [item]);
    }
    return out;
  };
}

const P = Promise as unknown as {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (v: T | PromiseLike<T>) => void;
    reject: (e?: unknown) => void;
  };
};
if (typeof P.withResolvers !== "function") {
  P.withResolvers = <T>() => {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export {};
