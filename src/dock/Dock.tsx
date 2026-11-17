import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ToolRun } from "../lenta";
import { ToolRow } from "./ToolRow";
import { Icon } from "../ui/icons";

export type DockTab = "agents" | "tools" | "ctx";

/**
 * Правая панель чата: вкладки «Подагенты», «Тулы», «Контекст». Вкладки
 * растягиваются вместе с панелью, а сжимаются не уже своего текста; эту
 * ширину панель сообщает наверх (`onMinWidth`), чтобы тяга не делала её уже.
 */
export function Dock({
  tab,
  setTab,
  tools,
  session,
  agentCount,
  agents,
  context,
  onClose,
  onMinWidth,
}: {
  tab: DockTab;
  setTab: (t: DockTab) => void;
  tools: ToolRun[];
  session: string;
  agentCount: number;
  agents: ReactNode;
  context: ReactNode;
  onClose: () => void;
  onMinWidth?: (w: number) => void;
}) {
  const running = tools.filter((t) => t.state === "running").length;
  const tabsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const t = tabsRef.current;
    if (!t || !onMinWidth) return;
    const keep = t.style.width;
    t.style.width = "max-content";
    const w = t.offsetWidth;
    t.style.width = keep;
    onMinWidth(Math.ceil(w) + 1);
  }, [onMinWidth, agentCount, tools.length, running]);
  return (
    <>
      <div className="tabs" role="tablist" ref={tabsRef}>
        <button role="tab" aria-selected={tab === "agents"} onClick={() => setTab("agents")}>
          Подагенты <b>{agentCount}</b>
        </button>
        <button role="tab" aria-selected={tab === "tools"} onClick={() => setTab("tools")}>
          Тулы <b>{tools.length}</b>
          {running ? <b className="live">{running}</b> : null}
        </button>
        <button role="tab" aria-selected={tab === "ctx"} onClick={() => setTab("ctx")}>
          Контекст
        </button>
        <button className="ibtn" onClick={onClose} aria-label="Закрыть панель">
          <Icon name="close" />
        </button>
      </div>
      <div className="dock-body" role="tabpanel">
        {tab === "agents" ? (
          agents
        ) : tab === "ctx" ? (
          context
        ) : tools.length === 0 ? (
          <div className="dock-empty">Пока ни одного вызова</div>
        ) : (
          [...tools].reverse().map((t) => <ToolRow key={t.callId} t={t} session={session} />)
        )}
      </div>
    </>
  );
}
