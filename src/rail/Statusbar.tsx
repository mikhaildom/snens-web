import type { SessionInfo } from "../api";

/** Статус-строка под composer'ом: модель и то, что за сессия открыта. */
export function Statusbar({ model, current }: { model: string; current?: SessionInfo }) {
  return (
    <div className="statusbar">
      <span className="sb--key" title={model}>
        <span className="sb--model-full">{model || "—"}</span>
        <span className="sb--model-short">
          {model.split("/").pop()?.replace("deepseek-v4.1-", "dsv4-") ?? "—"}
        </span>
      </span>
      {/* Ни состояния хода, ни счётчиков здесь нет: индикатор хода один — в
          топбаре, а длина журнала не отвечает на вопрос «что мне делать». */}
      <span className="sb--grow">
        {current ? (current.parent ? "подагент" : current.surface) : "нет сессии"}
        {current?.model && current.model !== model ? ` · ${current.model}` : ""}
      </span>
    </div>
  );
}
