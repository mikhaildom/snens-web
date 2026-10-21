import { useState } from "react";
import type { Part } from "../api";
import { Lightbox, Shots, Voices } from "./media";

/**
 * Вложения, которые можно увидеть и услышать. Картинки — то, что смотрел агент
 * (`view`) или что приложил человек; голосовые — с проигрыванием, потому что
 * распознавание живёт в ядре, а исходник нужно уметь переслушать.
 *
 * Картинки одного вызова идут одной строкой (при нехватке места — свайпом),
 * открываются во весь экран: пропорции сохраняются, ничего не растягивается.
 */
export function Attachments({ session, parts }: { session: string; parts?: Part[] }) {
  const [shot, setShot] = useState<number | null>(null);
  const images = (parts ?? []).filter((p) => p.kind === "image");
  const hasVisual = (parts ?? []).some((p) => p.kind === "image" || p.kind === "video");
  const hasAudio = (parts ?? []).some((p) => p.kind === "audio");
  if (!hasVisual && !hasAudio) return null;
  return (
    <>
      {hasVisual && <Shots session={session} parts={parts ?? []} onOpen={setShot} />}
      <Voices session={session} parts={parts} />
      {shot != null && (
        <Lightbox
          session={session}
          parts={images}
          index={shot}
          onIndex={setShot}
          onClose={() => setShot(null)}
        />
      )}
    </>
  );
}
