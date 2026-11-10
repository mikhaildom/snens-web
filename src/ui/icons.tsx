/**
 * Иконки редизайна: только прямые тонкие линии, без кривых и скруглений.
 * Сетка 16×16, штрих 1.25, концы и стыки острые. Цвет — currentColor.
 */
const PATHS = {
  search: "M2.5 2.5h8v8h-8zM10.5 10.5l3.5 3.5",
  plus: "M8 3v10M3 8h10",
  tickets: "M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z",
  settings: "M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7M9.5 2.5h2v4h-2zM4.5 9.5h2v4h-2z",
  rail: "M2.5 2.5h11v11h-11zM6.5 2.5v11",
  panel: "M2.5 2.5h11v11h-11zM9.5 2.5v11",
  burger: "M2 4h12M2 8h12M2 12h12",
  attach: "M11.5 5v8.5h-7v-11h5v8h-2.5V5",
  agents: "M2.5 2.5h4v3h-4zM9.5 7h4v3h-4zM9.5 11.5h4v3h-4zM4.5 5.5v7.5h5M4.5 8.5h5",
  send: "M8 13.5v-11M3.5 7 8 2.5 12.5 7",
  close: "m4 4 8 8M12 4l-8 8",
  chevron: "m6 3 5 5-5 5",
  info: "M2.5 2.5h11v11h-11zM8 7v4.5M8 4.5V6",
  trash: "M3 4.5h10M6 4.5v-2h4v2M4.5 4.5l1 9h5l1-9",
  back: "M10 3 5 8l5 5",
  copy: "M5.5 5.5h8v8h-8zM2.5 10.5v-8h8",
  branch: "M4.5 2v12M4.5 10.5l7-4V2",
  down: "M8 2.5v11M3.5 9 8 13.5 12.5 9",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="ico" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Стоп: залитый квадрат, единственная иконка с заливкой. */
export function StopIcon() {
  return (
    <svg className="ico" viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
      <path d="M4 4h8v8H4z" fill="currentColor" />
    </svg>
  );
}
