import { useRef } from "react";

export type PendingFile = { file: File; id: string };

/**
 * Composer: поле ввода, вложения под ним, drag&drop. Состояние черновика —
 * снаружи: отправка поднимается в App, где живёт сессия.
 */
export function Composer({
  draft,
  setDraft,
  pending,
  onAttach,
  onDetach,
  onSend,
}: {
  draft: string;
  setDraft: (v: string) => void;
  pending: PendingFile[];
  onAttach: (files: FileList | null) => void;
  onDetach: (id: string) => void;
  onSend: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div
      className="composer"
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.dataset.drag = "true";
      }}
      onDragLeave={(e) => {
        delete e.currentTarget.dataset.drag;
      }}
      onDrop={(e) => {
        e.preventDefault();
        delete e.currentTarget.dataset.drag;
        onAttach(e.dataTransfer.files);
      }}
    >
      {pending.length > 0 && (
        <ul className="composer__files">
          {pending.map((p) => (
            <li key={p.id}>
              <span>{p.file.name}</span>
              <span className="composer__size">{(p.file.size / 1024).toFixed(0)} КБ</span>
              <button className="ghost" aria-label="убрать" onClick={() => onDetach(p.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer__box">
        <button
          className="composer__attach"
          title="прикрепить файл"
          onClick={() => fileInput.current?.click()}
        >
          +
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onAttach(e.target.files);
            e.target.value = "";
          }}
        />
        {/* spellCheck выключен осознанно: браузер проверяет поле по языку
            страницы, а мы пишем смесью русского и английского — половина
            слов светилась как опечатка. Тот же эффект у autoCorrect на мобильных. */}
        <textarea
          value={draft}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          lang="ru"
          placeholder="печатай… enter — отправить, shift+enter — перенос, файлы — кнопкой + или drag&drop"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button className="solid" onClick={onSend}>
          send
        </button>
      </div>
    </div>
  );
}
