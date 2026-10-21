import type { SessionInfo } from "../api";

/** Статус-строка под composer'ом: модель, сессия, счётчики хода. */
export function Statusbar({
  model,
  current,
  turns,
  tools,
  running,
}: {
  model: string;
  current?: SessionInfo;
  turns: number;
  tools: number;
  running: boolean;
}) {
  return (
    <div className="statusbar">
      <span className="sb--key" title={model}>
        <span className="sb--model-full">{model || "—"}</span>
        <span className="sb--model-short">
          {model.split("/").pop()?.replace("deepseek-v4.1-", "dsv4-") ?? "—"}
        </span>
      </span>
      <span className="sb--grow">
        {current ? `${current.parent ? "подагент" : current.surface} · ${current.state}` : "нет сессии"}{" "}
        · {turns} записей
        {current?.model && current.model !== model ? ` · ${current.model}` : ""}
      </span>
      <span className="sb--opt">тулов {tools}</span>
      <span className="sb--opt">{running ? "ход идёт" : "простой"}</span>
    </div>
  );
}
