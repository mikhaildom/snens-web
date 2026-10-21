import type { Part } from "../api";

/** Расклад вложений по тому, чем их показывать. */
export function splitParts(parts?: Part[]) {
  const all = parts ?? [];
  return {
    visual: all.filter((p) => p.kind === "image" || p.kind === "video"),
    images: all.filter((p) => p.kind === "image"),
    audio: all.filter((p) => p.kind === "audio"),
  };
}
