import type { ReactNode } from "react";
import type { ToolRun } from "../lenta";
import { ToolRow } from "./ToolRow";

export type DockTab = "windows" | "tools";

/** Док: табы «окна»/«тулы», счётчик живых вызовов, кнопка закрытия на шторке. */
export function Dock({
  tab,
  setTab,
  tools,
  session,
  children,
  onClose,
}: {
  tab: DockTab;
  setTab: (t: DockTab) => void;
  tools: ToolRun[];
  session: string;
  children?: ReactNode;
  onClose?: () => void;
}) {
  const running = tools.filter((t) => t.state === "running").length;
  return (
    <>
      <div className="dock__tabs" role="tablist">
        <button role="tab" aria-selected={tab === "windows"} onClick={() => setTab("windows")}>
          окна
        </button>
        <button role="tab" aria-selected={tab === "tools"} onClick={() => setTab("tools")}>
          тулы <b>{tools.length}</b>
          {running ? <b className="live">{running}</b> : null}
        </button>
        {onClose && (
          <button className="dock__close" onClick={onClose} aria-label="закрыть док">
            ×
          </button>
        )}
      </div>
      <div className="dock__body" role="tabpanel">
        {tab === "windows" ? (
          children
        ) : tools.length === 0 ? (
          <div className="dock__empty">пока ни одного вызова</div>
        ) : (
          tools.map((t) => <ToolRow key={t.callId} t={t} session={session} />)
        )}
      </div>
    </>
  );
}
