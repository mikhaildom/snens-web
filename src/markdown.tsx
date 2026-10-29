import { memo, useMemo } from "react";
import MarkdownIt from "markdown-it";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Artifact } from "./lib/artifact.ts";
import { latestArtifacts, splitArtifacts } from "./lib/artifact.ts";
import { splitMermaid } from "./lib/mermaid.ts";
import { ArtifactView } from "./feed/Artifact.tsx";
import type { ArtifactAnswer, ArtifactAsk } from "./feed/Artifact.tsx";
import { MermaidDiagram } from "./feed/Mermaid.tsx";

/**
 * Markdown-рендер для чата агента.
 *
 * HTML отключён, автолинки включены, одиночные переводы строк = <br>.
 * Математика ($...$, $$...$$, \(...\), \[...\]) вытаскивается в плейсхолдеры
 * до markdown-разбора и подставляется обратно уже готовым HTML от KaTeX,
 * поэтому markdown не успевает съесть подчёркивания и звёздочки в формулах.
 *
 * Фенсы `artifact` (см. `lib/artifact.ts`, `docs/artifact.md`) режутся ДО
 * markdown-разбора: текст между ними рендерится как обычно, на месте фенса
 * встаёт iframe в песочнице. Один код обслуживает и историю, и стрим — иначе
 * переход «стрим → история» перерисовывал бы артефакт другим способом.
 *
 * Фенсы `mermaid` — там же и по той же причине (`lib/mermaid.ts`): схему
 * рисует компонент, который умеет перерисовываться по ходу стрима.
 */

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

// --- рендер кода -----------------------------------------------------------

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0] ?? "";
  const cls = lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : "";
  return `<pre class="code"><code${cls}>${md.utils.escapeHtml(token.content)}</code></pre>\n`;
};

// --- картинки --------------------------------------------------------------

/**
 * `images: false` — картинки не рендерим, оставляем alt-текстом.
 *
 * Так вывод инструментов (`fetch` вытаскивает со страниц десятки иконок и
 * трекеров) не превращается в стену картинок: показываем только то, что модель
 * реально смотрела зрением (`view` кладёт файл в канал вложений) или что она
 * сама вставила в свой ответ.
 */
type Env = { images?: boolean };

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  if ((env as Env | undefined)?.images === false) {
    const token = tokens[idx];
    const alt = token.content || String(token.attrGet("src") ?? "");
    return escapeHtml(alt);
  }
  return self.renderToken(tokens, idx, options);
};

// --- ссылки в новой вкладке ------------------------------------------------

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx];
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, idx, options);
};

// --- математика ------------------------------------------------------------

const PH_OPEN = "\uE000";
const PH_CLOSE = "\uE001";

/** Фенсы и инлайн-код: внутри них математику не трогаем. */
const CODE_SPLIT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

const MATH_PATTERNS: ReadonlyArray<{ re: RegExp; display: boolean }> = [
  { re: /\$\$([\s\S]+?)\$\$/g, display: true },
  { re: /\\\[([\s\S]+?)\\\]/g, display: true },
  { re: /\\\(([\s\S]+?)\\\)/g, display: false },
  // одиночный $: не экранирован, не "$ 5", закрывающий $ не перед цифрой
  { re: /(?<!\\)\$(?!\s)([^$\n]*?[^\s\\])\$(?!\d)/g, display: false },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMath(tex: string, display: boolean): string {
  try {
    const html = katex.renderToString(tex, {
      displayMode: display,
      strict: "ignore",
      throwOnError: false,
    });
    const cls = display ? "math math-display" : "math";
    return `<span class="${cls}">${html}</span>`;
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

/** Markdown + математика -> HTML. */
function renderMarkdown(source: string, images: boolean): string {
  if (!source) return "";

  const maths: string[] = [];

  const prepared = source
    .split(CODE_SPLIT)
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk; // код — как есть
      let out = chunk;
      for (const { re, display } of MATH_PATTERNS) {
        out = out.replace(re, (_m, tex: string) => {
          const id = maths.length;
          maths.push(renderMath(tex.trim(), display));
          return `${PH_OPEN}${id}${PH_CLOSE}`;
        });
      }
      return out;
    })
    .join("");

  // env, а не модульный флаг: рендер в React может идти параллельно.
  const html = md.render(prepared, { images });
  return html.replace(
    new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, "g"),
    (_m, id: string) => maths[Number(id)] ?? "",
  );
}

export interface MarkdownProps {
  /** Исходный markdown (может содержать формулы и артефакты). */
  text: string;
  /** Рендерить `![]()` картинками. По умолчанию да (ответы модели). */
  images?: boolean;
  /**
   * Сессия: артефактам нужна для `src=`-файлов и для `genui check`. Без неё
   * (дашборд тикетов) фенс показывается кодом — это документ, а не ответ модели.
   */
  session?: string;
  /** Вопрос объявлен артефактом (хост показывает подсказку). */
  onAsk?: (art: Artifact, ask: ArtifactAsk, scope: string) => void;
  /** Ответ человека из артефакта: уезжает в чат. */
  onAnswer?: (art: Artifact, answer: ArtifactAnswer, scope: string) => void;
  /**
   * Область одноразовости: номер записи журнала, в которой лежит артефакт.
   * Вместе с именем артефакта и именем вопроса даёт ключ, которым ядро решает,
   * отвечен ли вопрос (`409 ask_answered`).
   */
  scope?: string;
  /** Ключи уже отвеченных вопросов: интерфейс не должен спрашивать второй раз. */
  answered?: ReadonlySet<string>;
}

/** Один кусок markdown. Мемоизация по тексту: при стриме меняется только последний. */
const Chunk = memo(function Chunk({ text, images }: { text: string; images: boolean }) {
  const html = useMemo(() => renderMarkdown(text, images), [text, images]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
});

/**
 * Текст с схемами mermaid: markdown и диаграммы вперемешку.
 *
 * Мемоизация по тексту важна и здесь: пока модель печатает, меняется только
 * последний кусок, а уже нарисованные схемы не должны даже переразбираться.
 */
const Pieces = memo(function Pieces({ text, images }: { text: string; images: boolean }) {
  const segs = useMemo(() => splitMermaid(text), [text]);
  if (segs.length === 1 && segs[0].kind === "text") return <Chunk text={text} images={images} />;
  return (
    <>
      {segs.map((s, i) =>
        s.kind === "text" ? (
          <Chunk key={`t${i}`} text={s.text} images={images} />
        ) : (
          <MermaidDiagram key={`m${i}`} code={s.code} open={s.open} />
        ),
      )}
    </>
  );
});

/**
 * Текст модели: markdown и артефакты вперемешку.
 *
 * Без сессии или без фенсов — один `<div class="markdown">`, ровно как до
 * появления артефактов: регресс обычного рендера недопустим.
 */
export function Markdown({
  text,
  images = true,
  session,
  onAsk,
  onAnswer,
  scope = "",
  answered,
}: MarkdownProps) {
  const segs = useMemo(() => latestArtifacts(splitArtifacts(text)), [text]);
  const hasArtifact = segs.some((s) => s.kind === "artifact");
  if (!hasArtifact || !session) return <Pieces text={text} images={images} />;
  return (
    <div className="md-segments">
      {segs.map((s, i) =>
        s.kind === "text" ? (
          <Pieces key={`t${i}`} text={s.text} images={images} />
        ) : (
          <ArtifactView
            key={`a${s.art.id}`}
            art={s.art}
            session={session}
            onAsk={onAsk}
            onAnswer={onAnswer}
            scope={scope}
            answered={answered}
          />
        ),
      )}
    </div>
  );
}
