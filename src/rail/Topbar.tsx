import type { SessionInfo } from "../api";

type Props = {
  current?: SessionInfo;
  /** Заголовок родительской сессии, если открыт подагент. */
  parentTitle?: string;
  running: boolean;
  canStop: boolean;
  onStop: () => void;
  onBurger: () => void;
  onDock: () => void;
  /** Назад к родителю: шаг по истории браузера. */
  onBack: () => void;
};

/** Топбар: где мы, идёт ли ход, стоп и кнопка дока. */
export function Topbar({
  current,
  parentTitle,
  running,
  canStop,
  onStop,
  onBurger,
  onDock,
  onBack,
}: Props) {
  const inChild = Boolean(current?.parent);
  return (
    <header className="topbar" data-idle={!current}>
      <button className="ghost burger" onClick={onBurger} aria-label="сессии">
        ≡
      </button>
      {inChild && (
        <button className="ghost topbar__back" onClick={onBack} title={parentTitle ? `к «${parentTitle}»` : "назад"}>
          ← назад
        </button>
      )}
      <span className="topbar__title">
        {inChild && <span className="topbar__badge">подагент</span>}
        {current?.title ?? ""}
      </span>
      <div className="topbar__meta">
        <button className="ghost dock-toggle" onClick={onDock} aria-label="док">
          док
        </button>
        <span className="chip">
          <span className="dot" style={{ background: running ? "var(--accent)" : "var(--ok)" }} />
          {running ? "работает" : "простой"}
        </span>
        {running && canStop && (
          <button className="chip" onClick={onStop}>
            стоп
          </button>
        )}
      </div>
    </header>
  );
}
