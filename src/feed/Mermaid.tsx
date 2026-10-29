import { useEffect, useRef, useState } from "react";
import { useTheme } from "../theme.ts";

/**
 * Схема mermaid в ленте.
 *
 * Три решения, которые видны в коде:
 *
 * 1. **mermaid грузится лениво** (`import()` в момент первой схемы). Это
 *    ~1 МБ; в бандл основного экрана он не нужен никому, кто схем не видел.
 * 2. **Стрим**: пока фенс не закрыт, перерисовываем по времени, а не на каждый
 *    токен. Половина диаграммы — это синтаксическая ошибка, поэтому неудачный
 *    разбор не стирает то, что уже нарисовано: остаётся последняя удачная
 *    картинка, а текст копится дальше. Так схема «дорастает» до готовой.
 * 3. **Ошибка честная**: закрытый фенс, который mermaid не понял, показывает
 *    сообщение и исходный код — молча пустой блок выглядел бы как поломка клиента.
 */

/** Пауза между перерисовками живого черновика. */
const LIVE_MS = 400;

type Mod = typeof import("mermaid").default;
let loading: Promise<Mod> | null = null;

function loadMermaid(): Promise<Mod> {
  loading ??= import("mermaid").then((m) => m.default);
  return loading;
}

let seq = 0;

/** Тема mermaid под тему клиента: `auto` разрешается системной, светлая — `default`. */
function mermaidTheme(theme: string): "dark" | "default" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "default";
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "default";
}

export interface MermaidDiagramProps {
  code: string;
  /** Фенс не закрыт: модель печатает. */
  open?: boolean;
}

export function MermaidDiagram({ code, open = false }: MermaidDiagramProps) {
  const theme = useTheme();
  const variant = mermaidTheme(theme);
  /** Последняя удачная картинка: при неудачном разборе остаётся на экране. */
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mmd-${++seq}`);
  /** Что уже отрисовано: строка + тема, чтобы не гонять mermaid зря. */
  const drawn = useRef({ code: "", variant: "" });
  /** Момент, раньше которого живую схему не перерисовываем. */
  const nextAt = useRef(0);

  useEffect(() => {
    if (!code.trim()) return;
    if (drawn.current.code === code && drawn.current.variant === variant) return;

    let alive = true;
    const draw = async () => {
      nextAt.current = Date.now() + LIVE_MS;
      const mermaid = await loadMermaid();
      if (!alive) return;
      mermaid.initialize({
        startOnLoad: false,
        theme: variant,
        securityLevel: "strict",
        fontFamily: "inherit",
      });
      // Номер уникален на попытку: mermaid держит внутри временный узел по id,
      // и повтор с тем же id после ошибки иногда отдаёт пустую картинку.
      const id = `${idRef.current}-${++seq}`;
      try {
        // `parse` до `render`: render при ошибке ещё и вставляет в документ
        // временный узел, который видно до следующего кадра.
        // Невалидный текст бросает — ловим ниже.
        await mermaid.parse(code);
        if (!alive) return;
        const { svg: out } = await mermaid.render(id, code);
        if (!alive) return;
        drawn.current = { code, variant };
        setSvg(out);
        setFailed(false);
      } catch {
        if (!alive) return;
        // Недописанная схема — не ошибка, а состояние: ждём продолжения и
        // оставляем на экране последнюю удачную картинку.
        if (!open) setFailed(true);
      }
    };

    // Готовый фенс рисуем сразу. Живой — не чаще, чем раз в `LIVE_MS`: токены
    // идут потоком, а каждый `render` — это полный пересчёт раскладки.
    if (!open) {
      void draw();
      return () => {
        alive = false;
      };
    }
    const wait = Math.max(0, nextAt.current - Date.now());
    const timer = window.setTimeout(() => void draw(), wait);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [code, variant, open]);

  if (failed && !svg) {
    return (
      <div className="mermaid" data-state="error">
        <div className="mermaid__head">схема не разобрана</div>
        <pre className="code">
          <code className="language-mermaid">{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="mermaid" data-draft={open || undefined}>
      <div className="mermaid__head">
        <span className="mermaid__mark">{open ? "рисует…" : "схема"}</span>
      </div>
      {/* SVG приходит от mermaid: он экранирует подписи сам, html отключён
          (`securityLevel: strict`). */}
      <div className="mermaid__body" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
