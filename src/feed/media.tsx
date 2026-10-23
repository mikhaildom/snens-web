import { useEffect } from "react";
import type { Part } from "../api";
import { useFileSrc } from "../hooks/useFileSrc.ts";
import { splitParts } from "../lib/parts";

/**
 * Медиа сессии. Источник файла берётся не строкой, а хуком `useFileSrc`: в
 * режиме proxy это `<img src="/api/...">`, при прямом подключении — `blob:` из
 * `fetch` с заголовком (браузерные теги `Authorization` не умеют, а `?token=` ядро
 * принимает только на потоковых GET). Поэтому у каждого тега — свой маленький
 * компонент: хук нельзя вызвать в `.map`.
 */

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

function LightboxImage({
  session,
  part,
  onStop,
}: {
  session: string;
  part: Part;
  onStop: (e: React.MouseEvent) => void;
}) {
  const src = useFileSrc(session, part.path);
  if (!src) return null;
  return (
    <img
      className="lightbox__img"
      src={src}
      alt={part.path.split("/").pop() ?? "image"}
      onClick={onStop}
    />
  );
}

/**
 * Ссылка «файл» в лайтбоксе. При прямом подключении `href` — уже полученный
 * `blob:` (та же загрузка, что у картинки): обычный `<a>` без заголовка получил
 * бы 401. Атрибут `download` остаётся, но имя файла даёт браузер из blob-URL,
 * поэтому подпись ссылки — имя файла, а не «скачать».
 */
function FileLink({ session, part }: { session: string; part: Part }) {
  const src = useFileSrc(session, part.path);
  return (
    <a
      className="lightbox__file"
      href={src ?? "#"}
      target="_blank"
      rel="noreferrer"
      download={part.path.split("/").pop()}
      aria-disabled={!src}
    >
      {src ? "файл" : "файл…"}
    </a>
  );
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
        <FileLink session={session} part={part} />
        <button className="lightbox__close" onClick={onClose} aria-label="закрыть">
          ×
        </button>
      </div>
      <LightboxImage session={session} part={part} onStop={(e) => e.stopPropagation()} />
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

function Shot({ session, part, onOpen }: { session: string; part: Part; onOpen: () => void }) {
  const src = useFileSrc(session, part.path);
  return (
    <button
      className="shot"
      onClick={onOpen}
      title={`${part.path}${part.width ? ` · ${part.width}×${part.height}` : ""}`}
    >
      {src && (
        <img
          src={src}
          alt={part.path.split("/").pop() ?? "image"}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).closest(".shot")?.remove();
          }}
        />
      )}
    </button>
  );
}

function ShotVideo({ session, part }: { session: string; part: Part }) {
  const src = useFileSrc(session, part.path);
  // `src` появляется после загрузки — тег всё равно рендерим сразу: у него есть
  // собственные размеры и подпись, и место в ленте не должно прыгать.
  return <video src={src ?? undefined} controls preload="metadata" />;
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
          <Shot
            key={p.path}
            session={session}
            part={p}
            onOpen={() => onOpen(images.indexOf(p))}
          />
        ) : (
          <ShotVideo key={p.path} session={session} part={p} />
        ),
      )}
    </div>
  );
}

function Voice({ session, part }: { session: string; part: Part }) {
  const src = useFileSrc(session, part.path);
  return (
    <figure className="voice">
      <audio src={src ?? undefined} controls preload="metadata" />
      <figcaption>
        {part.kind === "audio" ? "голосовое" : part.kind} · {(part.bytes / 1024).toFixed(0)} КБ
      </figcaption>
    </figure>
  );
}

/** Голосовые и прочее аудио: с проигрыванием — переслушать исходник. */
export function Voices({ session, parts }: { session: string; parts?: Part[] }) {
  const { audio } = splitParts(parts);
  return (
    <>
      {audio.map((p) => (
        <Voice key={p.path} session={session} part={p} />
      ))}
    </>
  );
}
