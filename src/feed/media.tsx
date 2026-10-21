import { useEffect } from "react";
import type { Part } from "../api";
import { fileUrl } from "../lib/format";
import { splitParts } from "../lib/parts";

/** Esc — закрыть, стрелки — листать. Прокрутка страницы на время просмотра снята. */
function useLightboxKeys(
  index: number,
  count: number,
  onIndex: (i: number) => void,
  onClose: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % count);
      if (e.key === "ArrowLeft") onIndex((index - 1 + count) % count);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, count, onClose, onIndex]);
}

/** Полноэкранный просмотр картинки: без растягивания, с листанием. */
export function Lightbox({
  session,
  parts,
  index,
  onIndex,
  onClose,
}: {
  session: string;
  parts: Part[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const part = parts[index];
  useLightboxKeys(index, parts.length, onIndex, onClose);
  if (!part) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lightbox__bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox__name">{part.path.split("/").pop()}</span>
        <span className="lightbox__dim">
          {part.width && part.height ? `${part.width}×${part.height}` : ""}
          {parts.length > 1 ? ` · ${index + 1}/${parts.length}` : ""}
        </span>
        <a className="lightbox__file" href={fileUrl(session, part.path)} target="_blank" rel="noreferrer">
          файл
        </a>
        <button className="lightbox__close" onClick={onClose} aria-label="закрыть">
          ×
        </button>
      </div>
      <img
        className="lightbox__img"
        src={fileUrl(session, part.path)}
        alt={part.path.split("/").pop() ?? "image"}
        onClick={(e) => e.stopPropagation()}
      />
      {parts.length > 1 && (
        <>
          <button
            className="lightbox__nav lightbox__nav--prev"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + parts.length) % parts.length);
            }}
            aria-label="предыдущая"
          >
            ‹
          </button>
          <button
            className="lightbox__nav lightbox__nav--next"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % parts.length);
            }}
            aria-label="следующая"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/** Вложения-картинки/видео одной строкой; листание — в `Lightbox`. */
export function Shots({
  session,
  parts,
  onOpen,
}: {
  session: string;
  parts: Part[];
  onOpen: (index: number) => void;
}) {
  const { visual, images } = splitParts(parts);
  return (
    <div className="shots">
      {visual.map((p) =>
        p.kind === "image" ? (
          <button
            key={p.path}
            className="shot"
            onClick={() => onOpen(images.indexOf(p))}
            title={`${p.path}${p.width ? ` · ${p.width}×${p.height}` : ""}`}
          >
            <img
              src={fileUrl(session, p.path)}
              alt={p.path.split("/").pop() ?? "image"}
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).closest(".shot")?.remove();
              }}
            />
          </button>
        ) : (
          <video key={p.path} src={fileUrl(session, p.path)} controls preload="metadata" />
        ),
      )}
    </div>
  );
}

/** Голосовые и прочее аудио: с проигрыванием — переслушать исходник. */
export function Voices({ session, parts }: { session: string; parts?: Part[] }) {
  const { audio } = splitParts(parts);
  return (
    <>
      {audio.map((p) => (
        <figure className="voice" key={p.path}>
          <audio src={fileUrl(session, p.path)} controls preload="metadata" />
          <figcaption>
            {p.kind === "audio" ? "голосовое" : p.kind} · {(p.bytes / 1024).toFixed(0)} КБ
          </figcaption>
        </figure>
      ))}
    </>
  );
}
