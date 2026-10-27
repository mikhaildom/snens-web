/**
 * Сборка документа артефакта для `iframe srcdoc`.
 *
 * Отдельно от React и от `Artifact.tsx`, потому что здесь живёт контракт
 * песочницы: CSP, шим `window.snens`, инъекция библиотеки компонентов и тема.
 * Ровно этот же документ строит `genui check` (на Rust) — расхождение здесь
 * означало бы «у модели работает, у человека нет».
 */
import { artifactCsp, type ArtifactHead } from "./artifact.ts";

/** Что нужно документу сверх тела фенса. */
export interface DocParts {
  head: ArtifactHead;
  /** Тело фенса как есть (HTML-фрагмент или целый документ). */
  body: string;
  /** Содержимое библиотеки: `lib.js` и компоненты, в этом порядке. */
  library?: Array<{ name: string; source: string }>;
  /** Данные для `window.snens.data`. */
  data?: unknown;
  /** Скрипты разрешены? В черновике стрима — нет. */
  scripts: boolean;
  /**
   * Имена уже отвеченных вопросов этого артефакта. Документ узнаёт о них через
   * `snens.answered` и может погасить свой интерфейс. Список приходит снаружи,
   * потому что вопросы задаются из JS и хост узнаёт о них только после вопроса.
   */
  answered?: string[];
}

/**
 * Тема snens для артефакта: те же токены, что у клиента, чтобы интерфейс в
 * ленте не выглядел чужим. Значения — копия `styles/00-tokens.css`; расхождение
 * не критично (артефакт может быть и на своей палитре), поэтому не импортируем.
 */
const THEME = `
:root{
  --paper:#eeeae1;--paper-2:#e4dfd4;--paper-3:#d7d1c3;
  --ink:#0b0b0b;--ink-2:#575247;--line:#0b0b0b;--hair:#b8b1a1;
  --accent:#ff3b00;--accent-ink:#fff6f0;--ok:#14a300;
  --mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
  color-scheme:light dark;
}
@media (prefers-color-scheme:dark){
  :root{--paper:#0d0d0d;--paper-2:#161616;--paper-3:#1f1f1f;--ink:#eeeae1;
        --ink-2:#a8a29a;--line:#eeeae1;--hair:#3a3a3a;--accent:#ff5a26;--accent-ink:#140800}
}
html[data-theme="dark"]{--paper:#0d0d0d;--paper-2:#161616;--paper-3:#1f1f1f;--ink:#eeeae1;
  --ink-2:#a8a29a;--line:#eeeae1;--hair:#3a3a3a;--accent:#ff5a26;--accent-ink:#140800}
html[data-theme="light"]{--paper:#eeeae1;--paper-2:#e4dfd4;--paper-3:#d7d1c3;--ink:#0b0b0b;
  --ink-2:#575247;--line:#0b0b0b;--hair:#b8b1a1;--accent:#ff3b00;--accent-ink:#fff6f0}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);
  font-family:var(--mono);font-size:13px;line-height:1.45}
body{padding:10px 12px;overflow:hidden}
`;

/**
 * Шим: единственный канал артефакта наружу. `postMessage` с `*`, потому что
 * цель (`sandbox` без `allow-same-origin`) имеет origin `null` — конкретный
 * origin указать нечем. Родитель проверяет `event.source`.
 */
function shim(data: unknown, answered: string[] = []): string {
  const json = JSON.stringify(data ?? null).replace(/<\/script/gi, "<\\/script");
  const answeredJson = JSON.stringify(answered).replace(/<\/script/gi, "<\\/script");
  return `<script>
(function(){
  var post=function(m){m.snens=1;try{parent.postMessage(m,"*")}catch(e){}};
  window.snens={
    data:${json}||null,
    answered:${answeredJson}||[],
    // ask — объявление вопроса (хост узнаёт, что он существует, и может
    // показать подсказку); answer — то, что человек выбрал: именно это уезжает
    // в чат репликой.
    ask:function(o){post(Object.assign({type:"ask"},o||{}))},
    answer:function(o){post(Object.assign({type:"answer"},o||{}))},
    send:function(t){post({type:"answer",kind:"text",id:"send",value:String(t)})},
    note:function(t){post({type:"note",text:String(t)})}
  };
  var said={};
  function report(message,line){
    var key=String(message).slice(0,200)+"@"+line;
    if(said[key])return;said[key]=1;
    post({type:"error",message:String(message),line:line||0});
  }
  window.addEventListener("error",function(e){
    report(e.message||(e.target&&e.target.src)||"ошибка загрузки",e.lineno||0);
  },true);
  window.addEventListener("unhandledrejection",function(e){report("unhandled rejection: "+e.reason,0)});
  var ce=console.error;
  console.error=function(){
    try{report(Array.prototype.map.call(arguments,String).join(" "),0)}catch(x){}
    return ce.apply(console,arguments);
  };
  // Высота СОДЕРЖИМОГО, а не окна: scrollHeight у корня в iframe равен высоте
  // самого iframe, и артефакт навсегда остался бы на дефолте.
  // getBoundingClientRect у body даёт реальный размер разметки с padding.
  // (Бэктики в комментариях здесь нельзя: они закрывают template literal.)
  function fit(){
    var b=document.body;
    var h=b?Math.ceil(b.getBoundingClientRect().height):0;
    post({type:"height",h:h});
  }
  window.addEventListener("load",function(){post({type:"ready"});fit()});
  if(window.ResizeObserver){
    try{new ResizeObserver(fit).observe(document.documentElement)}catch(e){}
  }
  setTimeout(fit,50);setTimeout(fit,300);setTimeout(fit,1200);
})();
</script>`;
}

/**
 * Вставить строку в чужой документ: в `<head>` (если он есть), иначе в начало.
 * Модель может написать и полный `<!doctype html>…`, и голый фрагмент — оба
 * варианта обязаны получить CSP и шим, иначе первый же артефакт «с головой»
 * исполнится без политики.
 */
function inject(doc: string, what: "head" | "start", html: string): string {
  if (what === "head") {
    const head = /<head(\s[^>]*)?>/i.exec(doc);
    if (head) {
      const at = head.index + head[0].length;
      return doc.slice(0, at) + html + doc.slice(at);
    }
    const root = /<html(\s[^>]*)?>/i.exec(doc);
    if (root) {
      const at = root.index + root[0].length;
      return doc.slice(0, at) + html + doc.slice(at);
    }
    const doctype = /^\s*<!doctype[^>]*>/i.exec(doc);
    const at = doctype ? doctype[0].length : 0;
    return doc.slice(0, at) + `<head>${html}</head>` + doc.slice(at);
  }
  const body = /<body(\s[^>]*)?>/i.exec(doc);
  if (body) {
    const at = body.index + body[0].length;
    return doc.slice(0, at) + html + doc.slice(at);
  }
  return html + doc;
}

/** Документ целиком: CSP → тема → шим → библиотека → тело. */
export function composeDocument({
  head,
  body,
  library = [],
  data,
  scripts,
  answered = [],
}: DocParts): string {
  const csp = artifactCsp(head, scripts);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  const theme = `<style>${THEME}</style>`;
  // Библиотека — до тела: компоненты должны быть зарегистрированы, когда
  // браузер дойдёт до пользовательских тегов. Инлайн, а не `<script src>`:
  // origin песочницы `null`, сети нет — внешний файл просто не загрузится.
  const lib = library
    .map((f) => `<script data-genui="${escapeAttr(f.name)}">${f.source.replace(/<\/script/gi, "<\\/script")}</script>`)
    .join("\n");
  const boot = scripts ? shim(data, answered) : `<script>window.snens={data:${JSON.stringify(data ?? null).replace(/<\/script/gi, "<\\/script")},ask:function(){},send:function(){}};</script>`;

  const inner = `${body}`;
  if (/<html[\s>]/i.test(inner)) {
    // Полный документ от модели: вставляем свои части внутрь него, чтобы не
    // получить два `<html>` (браузер бы взял первый, наш, и тело модели
    // оказалось бы за пределами разметки).
    let doc = inject(inner, "head", `${meta}${theme}`);
    doc = inject(doc, "start", `${boot}${lib}`);
    return doc;
  }
  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8">${meta}${theme}</head>
<body>${boot}${lib}
${inner}
</body></html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Подпись артефакта: `3.1 КБ · 61 строка`. Живёт в шапке блока и НЕ зависит от
 * перерисовки: пока модель печатает, растут только цифры — по ним и видно, что
 * поток жив, даже когда iframe ещё не обновился.
 */
export function artifactSize(body: string): string {
  const bytes = new TextEncoder().encode(body).length;
  const lines = body ? body.split("\n").length : 0;
  const kb = bytes < 1024 ? `${bytes} Б` : `${(bytes / 1024).toFixed(1)} КБ`;
  // Склонение как в остальном интерфейсе (см. `lib/format.ts`): 0 и 5+ — «строк».
  const n = lines % 10;
  const n100 = lines % 100;
  const word =
    n === 1 && n100 !== 11 ? "строка" : n >= 2 && n <= 4 && (n100 < 12 || n100 > 14) ? "строки" : "строк";
  return `${kb} · ${lines} ${word}`;
}
