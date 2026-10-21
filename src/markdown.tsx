import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Markdown-рендер для чата агента.
 *
 * HTML отключён, автолинки включены, одиночные переводы строк = <br>.
 * Математика ($...$, $$...$$, \(...\), \[...\]) вытаскивается в плейсхолдеры
 * до markdown-разбора и подставляется обратно уже готовым HTML от KaTeX,
 * поэтому markdown не успевает съесть подчёркивания и звёздочки в формулах.
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
      throwOnError: false,
      strict: "ignore",
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
  /** Исходный markdown (может содержать формулы). */
  text: string;
  /** Рендерить `![]()` картинками. По умолчанию да (ответы модели). */
  images?: boolean;
}

export function Markdown({ text, images = true }: MarkdownProps) {
  const html = useMemo(() => renderMarkdown(text, images), [text, images]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
