import type { SessionInfo } from "../api";

/** Строка статуса подагента: текст и цвет точки. */
export function agentStatus(s: SessionInfo): {
  text: string;
  kind: "ok" | "warn" | "err" | "idle";
} {
  const turns = s.turns ?? 0;
  const moves = `${turns} ${turns === 1 ? "ход" : turns >= 2 && turns <= 4 ? "хода" : "ходов"}`;
  if (s.done === "ok") return { text: `закончил · ${moves}`, kind: "ok" };
  if (s.done) return { text: `${s.done} · ${moves}`, kind: "err" };
  if (s.state === "running") return { text: `работает · ${moves}`, kind: "warn" };
  return { text: `ждёт · ${moves}`, kind: "idle" };
}
