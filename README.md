# snens/web

Мокап веб-клиента snens: rail сессий, лента ходов, composer, инспектор контекста.
Стиль — брутализм, только моноширинный (JetBrains Mono, локально через @fontsource).
Тема: `auto` (по системе) / `light` / `dark`, живёт в CSS-переменных и `data-theme` на `<html>`.

```sh
npm i
npm run dev      # http://127.0.0.1:5174
```

- `?theme=light|dark|auto` — разовый просмотр без записи в localStorage.
- Данные — `src/mock.ts`, API пока нет.
- Дальше: Tauri-обёртка, стрим тулов и диффов, очередь тикетов в rail.
