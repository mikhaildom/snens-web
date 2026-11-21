// Первым импортом: полифилы должны встать до кода, который их зовёт.
import "./lib/legacy-polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import App from "./App";
import { PairGate } from "./pair/PairGate";
import { applyTheme, initialTheme } from "./theme";
import "./index.css";

// тема выставляется до первого рендера, чтобы не мигало
applyTheme(initialTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Сначала соединение с ядром, потом лента: без адреса и токена
        приложению нечего запрашивать (см. `pair/PairGate.tsx`). */}
    <PairGate>
      <App />
    </PairGate>
  </StrictMode>,
);
