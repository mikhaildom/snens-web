# snens-web

Веб-клиент агента snens: живой транскрипт сессии — реплика человека, свёрнутая
пачка шагов, ответ модели. Vite + React + TypeScript, данных своего не держит:
всё берёт из API ядра (`snens serve`). Стиль — брутализм, JetBrains Mono, ноль
радиусов, темы `auto`/`light`/`dark` в CSS-переменных.

## Запуск

```sh
npm i
npm run dev                       # http://localhost:<порт>
SNENS_WEB_PORT=5175 npm run dev   # другой порт (strictPort: занятый — ошибка, не сдвиг)
npm run build                     # tsc -b && vite build → dist/
npm test                          # node --test, src/**/*.test.ts
npm run lint                      # oxlint
```

Dev-сервер проксирует `/api` → `SNENS_API_BASE` и подставляет `Authorization: Bearer`
из `SNENS_API_TOKEN_FILE`: токен остаётся в dev-сервере, в бандл не попадает.

| переменная | дефолт | что делает |
|---|---|---|
| `SNENS_WEB_PORT` | из `vite.config.ts` | порт dev-сервера |
| `SNENS_API_BASE` | адрес ядра из `vite.config.ts` | куда проксировать `/api` |
| `SNENS_API_TOKEN_FILE` | `~/.local/share/snens/api.token` | откуда брать токен |
| `SNENS_PROXY=0` | — | выключить прокси: проверка прямого подключения |

Без прокси соединение берётся из `window.__SNENS__` (десктоп-оболочка) или
`localStorage["snens-connection"]` (пейринг) — приоритеты в `src/lib/connection.ts`.

Параметры адреса: `?session=<id>` — открыть сессию, `?nostream=1` — снимок без SSE,
`?dock=1` — док раскрыт, `?theme=light|dark|auto` — разовый просмотр.

## Структура

| путь | слой |
|---|---|
| `src/api.ts` | клиент `/v1`: типы, запросы, SSE-подписка, `uuid()` с фолбэком |
| `src/lenta.ts` | правила ленты без React: `applyEvent` (SSE → блоки), `collectTools`, `buildBlocks`; покрыто `lenta.test.ts` |
| `src/App.tsx` | состояние сессии и раскладка, разметки почти нет |
| `src/lib/` | чистые функции и форматтеры: `time`, `format`, `connection`, `tool`, `parts`, `context`, `shell`, `providers`, `agent`, `mermaid` |
| `src/hooks/` | эффекты, вынутые из `App`: активная сессия, список, транскрипт, окно контекста, поиск, вложения |
| `src/feed/` | лента: `Feed`, `turns`, `Fold`, `ToolBlock`, media, вложения, `UsageBar`, `Mermaid` |
| `src/dock/`, `src/rail/`, `src/composer/`, `src/settings/`, `src/pair/`, `src/dashboard/` | док с подагентами и контекстом, список сессий и поиск, ввод, настройки, пейринг, дашборд тикетов и ревью |
| `src/styles/` | CSS по слоям: порядок `@import` в `index.css` = приоритет каскада |

## Тексты интерфейса

Отдельного слоя i18n нет: подписи лежат в JSX своих компонентов, по-русски. Форматы,
которые повторяются в нескольких местах, вынесены в `src/lib/` и правятся только там:

| что | где |
|---|---|
| склонения и краткие подписи (`1 шаг / 2 шага`, аргументы вызова) | `src/lib/format.ts` |
| время, длительность, «только что / 12 мин / вчера» | `src/lib/time.ts` |
| тексты ошибок по умолчанию | `errorText` в `src/lib/connection.ts` |
| пометки состояния тула (`✓`, `×`, `●`) | `MARK` в `src/lib/tool.ts` |

Новый текст — в компоненте рядом с местом показа; новый формат — функция в `lib/`
с тестом. Форматтеры в компонентах не дублировать.

## Грабли

- `crypto.randomUUID` есть только в secure context: по `http://<хост>:<порт>` его нет,
  поэтому в `api.ts` свой `uuid()` с фолбэком.
- SSE (`EventSource`) идёт с `?token=…`, файлы сессии при прямом подключении — через
  `fetch` с заголовком и `blob:` (`src/hooks/useFileSrc.ts`).
- Новый тип события SSE добавляется в `applyEvent` (`lenta.ts`), а не в компоненты.
- Схемы mermaid грузятся лениво (`import()` в `feed/Mermaid.tsx`): ~1 МБ в бандле
  основного экрана не нужен тем, кто схем не видел. Живой фенс перерисовывается
  не чаще раза в 400 мс, а неудачный разбор недописанной схемы не стирает
  последнюю удачную картинку.
- Новый CSS-слой = файл в `styles/` + `@import` в нужном месте порядка.
