import type { SessionInfo } from "../api";

type Props = {
  current?: SessionInfo;
  running: boolean;
  canStop: boolean;
  onStop: () => void;
  onBurger: () => void;
  onDock: () => void;
};

/** Топбар: где мы, идёт ли ход, stop и кнопка дока. */
export function Topbar({ current, running, canStop, onStop, onBurger, onDock }: Props) {
  return (
    <header className="topbar" data-idle={!current}>
      <button className="ghost burger" onClick={onBurger} aria-label="sessions">
        ≡
      </button>
      <span className="topbar__title">{current?.title ?? ""}</span>
      <div className="topbar__meta">
        <button className="ghost dock-toggle" onClick={onDock} aria-label="док">
          док
        </button>
        <span className="chip">
          <span className="dot" style={{ background: running ? "var(--accent)" : "var(--ok)" }} />
          {running ? "работает" : "idle"}
        </span>
        {running && canStop && (
          <button className="chip" onClick={onStop}>
            stop
          </button>
        )}
      </div>
    </header>
  );
}
