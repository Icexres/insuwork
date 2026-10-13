import Link from "next/link";
import type { ReactNode } from "react";

// Primitives shared by every InsuWork screen (Claude Design project "InsuWork", workspace files).

export type IconName =
  | "layers"
  | "layout-dashboard"
  | "folder"
  | "list-checks"
  | "bell"
  | "circle-help"
  | "arrow-right"
  | "arrow-up"
  | "settings";

export function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/icons/${name}.svg`} alt="" width={size} height={size} className={`shrink-0 ${className}`} style={{ width: size, height: size }} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block shrink-0 whitespace-nowrap rounded border-[0.5px] border-edge bg-raised px-2 py-1 font-mono text-[10px] leading-[1.3] text-fg">
      {children}
    </span>
  );
}

/** 6px status dot + label. accent = needs attention / live, danger = claim open, idle = closed. */
export function StatusDot({ children, tone = "muted" }: { children: ReactNode; tone?: "accent" | "danger" | "muted" | "idle" }) {
  const dot = { accent: "bg-accent", danger: "bg-danger", muted: "bg-muted", idle: "bg-edge" }[tone];
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${tone === "idle" ? "text-muted" : "text-fg"}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

type ButtonProps = {
  children: ReactNode;
  primary?: boolean;
  /** quiet secondary with a danger ring (file a claim) */
  danger?: boolean;
  /** 44px form-action size */
  large?: boolean;
  icon?: IconName;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** submit button inside a <form action={serverAction}> */
  submit?: boolean;
};

export function Button({ children, primary, danger, large, icon, href, onClick, disabled, submit }: ButtonProps) {
  const tone = primary
    ? "bg-accent font-medium text-canvas hover:text-canvas hover:brightness-[1.06]"
    : danger
      ? "bg-raised text-fg shadow-[inset_0_0_0_0.5px_theme(colors.danger)] hover:text-bright"
      : "bg-raised text-fg shadow-[inset_0_0_0_0.5px_theme(colors.edge)] hover:text-bright hover:shadow-[inset_0_0_0_0.5px_theme(colors.muted)]";
  const cls = `press inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg transition-[filter,color,box-shadow] disabled:pointer-events-none disabled:opacity-50 ${
    large ? "min-h-11 px-[18px] text-sm" : "min-h-10 px-4 text-[13px]"
  } ${tone}`;
  const body = (
    <>
      {children}
      {icon && <Icon name={icon} size={15} />}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type={submit ? "submit" : "button"} className={cls} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}

/** Quiet text link: "← All claims". */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-8 items-center self-start text-[13px] text-muted hover:text-bright">
      {children}
    </Link>
  );
}

export function Eyebrow({ children, faint }: { children: ReactNode; faint?: boolean }) {
  return <p className={`font-mono text-[11px] leading-normal ${faint ? "text-faint" : "text-muted"}`}>{children}</p>;
}

export function Divider() {
  return <hr className="w-full border-0 border-t-[0.5px] border-line" />;
}

/**
 * Card section. `side` = the aside variant: 20px padding, 14px title —
 * "info" titles are muted (reference panels), "action" titles stay bright (forms, live lists).
 */
export function Panel({
  title,
  badge,
  action,
  side,
  highlight,
  dashed,
  children,
  className = "",
}: {
  title?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  side?: "info" | "action";
  /** brighter ring: the panel that holds the next thing to do */
  highlight?: boolean;
  /** empty state */
  dashed?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-xl border-[0.5px] bg-surface ${
        side ? "gap-3 p-5" : "gap-4 p-[clamp(16px,2.5vw,24px)]"
      } ${dashed ? "border-dashed border-edge" : highlight ? "border-edge" : "border-line"} ${className}`}
    >
      {(title || badge || action) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className={`font-medium ${side ? "text-sm" : "text-base"} ${side === "info" ? "text-muted" : "text-bright"}`}>{title}</h2>
          {badge && (typeof badge === "string" ? <Badge>{badge}</Badge> : badge)}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Soft inset note. `risk` tints it for capital-at-risk copy; `positive` for a completed step. */
export function Notice({ title, children, tone }: { title: ReactNode; children?: ReactNode; tone?: "risk" | "positive" }) {
  const box =
    tone === "risk"
      ? "bg-danger/[0.06] shadow-[inset_0_0_0_0.5px_rgb(242_135_95/0.3)]"
      : tone === "positive"
        ? "bg-accent/[0.05] shadow-[inset_0_0_0_0.5px_rgb(228_242_34/0.25)]"
        : "bg-white/[0.025] shadow-[inset_0_0_0_0.5px_theme(colors.line)]";
  return (
    <div className={`flex w-full flex-col gap-1 rounded-lg px-4 py-3.5 ${box}`}>
      <p className={`text-[13px] font-medium ${tone ? "text-bright" : "text-fg"}`}>{title}</p>
      {children && <div className={`text-xs leading-[1.55] ${tone ? "text-fg" : "text-muted"}`}>{children}</div>}
    </div>
  );
}

/** Label left, mono value right; wraps under the label when narrow. `strong` = a total line. */
export function Detail({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <span className={strong ? "text-sm text-bright" : "text-[13px] text-muted"}>{label}</span>
      <span className={`ml-auto text-right font-mono ${strong ? "text-lg text-bright" : "text-xs leading-[1.6] text-fg"}`}>{value}</span>
    </div>
  );
}

/** Stacked label over value (inside <Facts>). Default = mono eyebrow + sans value; `mono` = sans label + mono value. */
export function Fact({ label, value, mono }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {mono ? <dt className="text-[11px] text-faint">{label}</dt> : <dt className="font-mono text-[10px] text-faint">{label}</dt>}
      <dd className={mono ? "font-mono text-xs text-fg" : "text-[13px] leading-[1.45] text-fg"}>{value}</dd>
    </div>
  );
}

/** Grid of Facts that reflows from several columns down to one. */
export function Facts({ children, min = "9rem" }: { children: ReactNode; min?: string }) {
  return (
    <dl className="grid gap-x-5 gap-y-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))` }}>
      {children}
    </dl>
  );
}

const inputBox = "rounded-lg border-[0.5px] border-edge bg-canvas text-[15px] leading-normal text-bright placeholder:text-faint";
const inputCls = `w-full min-w-0 px-3 py-2.5 ${inputBox} focus:border-muted focus:outline-none disabled:opacity-60`;

/** Text input, textarea (`rows`) or select (`options`). Pass `onChange` to make it controlled. */
export function Field({
  label,
  name,
  value,
  placeholder,
  rows,
  options,
  onChange,
  inputMode,
  type,
  prefix,
  mono,
  hint,
  error,
  maxLength,
  action,
  className = "",
}: {
  label: ReactNode;
  name?: string;
  value?: string;
  placeholder?: string;
  rows?: number;
  options?: [value: string, label: string][];
  onChange?: (value: string) => void;
  inputMode?: "decimal" | "numeric" | "text";
  type?: "text" | "date" | "datetime-local";
  /** fixed text before the value: "$", "github.com/" */
  prefix?: string;
  mono?: boolean;
  /** right-aligned note on the label row (counters) */
  hint?: ReactNode;
  error?: string;
  maxLength?: number;
  /** small button inside the input box, e.g. MAX */
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  const bind = onChange
    ? { value: value ?? "", onChange: (e: { target: { value: string } }) => onChange(e.target.value) }
    : { defaultValue: value };
  // explicit name: a wrapped textarea would otherwise fold its own text into its accessible name
  const common = { name, maxLength, "aria-label": typeof label === "string" ? label : undefined, "aria-invalid": error ? true : undefined, ...bind };
  const font = mono ? "font-mono text-sm" : "";
  const bad = error ? "border-danger" : "";
  return (
    <label className={`flex min-w-0 flex-1 flex-col gap-2 ${className}`}>
      <span className="flex justify-between gap-3 text-xs leading-normal text-muted">
        {label}
        {hint && <span className="font-mono text-faint">{hint}</span>}
      </span>
      {options ? (
        <select {...common} className={`${inputCls} ${bad} min-h-11 [color-scheme:dark]`}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      ) : rows ? (
        <textarea rows={rows} {...common} placeholder={placeholder} className={`${inputCls} ${font} ${bad} resize-y`} />
      ) : prefix || action ? (
        <span className={`flex items-center overflow-hidden ${inputBox} ${bad} focus-within:border-muted`}>
          {prefix && <span className="shrink-0 pl-3 font-mono text-sm text-faint">{prefix}</span>}
          <input {...common} type={type} inputMode={inputMode} placeholder={placeholder}
            className={`min-h-11 w-full min-w-0 border-0 bg-transparent py-2.5 pr-3 font-mono text-sm text-bright placeholder:text-faint focus:outline-none ${prefix ? "pl-1" : "pl-3"}`} />
          {action && (
            <button type="button" onClick={action.onClick} className="mr-1.5 h-[30px] shrink-0 rounded-md bg-raised px-2.5 font-mono text-[11px] text-fg hover:text-bright">
              {action.label}
            </button>
          )}
        </span>
      ) : (
        <input {...common} type={type} inputMode={inputMode} placeholder={placeholder} className={`${inputCls} ${font} ${bad} min-h-11 [color-scheme:dark]`} />
      )}
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </label>
  );
}

/** Grid of Fields that reflows (side by side on wide panels, stacked on phones). */
export function FieldRow({ children, min = "12rem" }: { children: ReactNode; min?: string }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))` }}>
      {children}
    </div>
  );
}

/** Pill toggle between a few options (release mode, yes/no). */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label?: string;
  options: [value: T, label: string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-[9px] bg-canvas p-[3px] shadow-[inset_0_0_0_0.5px_theme(colors.line)]">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}
          className={`min-h-9 min-w-[72px] whitespace-nowrap rounded-md px-3 text-[13px] transition-colors ${v === value ? "bg-line text-bright" : "text-muted hover:text-fg"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Segmented look on native radios, for server-action forms (no client state). */
export function Choice({ name, options, defaultValue, label, disabled }: {
  name: string; options: [value: string, label: string][]; defaultValue: string; label: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid shrink-0 auto-cols-fr grid-flow-col gap-1 rounded-[9px] bg-canvas p-[3px] shadow-[inset_0_0_0_0.5px_theme(colors.line)]">
      {options.map(([v, l]) => (
        <label key={v} className="cursor-pointer">
          <input type="radio" name={name} value={v} defaultChecked={v === defaultValue} disabled={disabled} className="peer sr-only" />
          <span className="flex h-9 min-w-[72px] items-center justify-center rounded-md px-3.5 text-[13px] text-muted transition-colors peer-checked:bg-line peer-checked:text-bright peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg">
            {l}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Large radio rows (pick a freelancer, cast a ruling). `columns` lays them side by side. */
export function RadioCards<T extends string>({ label, options, value, onChange, columns }: {
  label: string;
  options: { value: T; title: ReactNode; body?: ReactNode; aside?: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  columns?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className={columns ? "grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]" : "flex flex-col gap-2"}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={o.disabled} onClick={() => onChange(o.value)}
            className={`flex w-full rounded-[10px] px-4 py-3.5 text-left transition-[box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-50 ${
              columns ? "flex-col items-start gap-1.5" : "items-center gap-3.5"
            } ${on ? "bg-raised shadow-[inset_0_0_0_1px_theme(colors.accent)]" : "bg-canvas shadow-[inset_0_0_0_0.5px_theme(colors.edge)] hover:bg-[#0c0d0e]"}`}>
            <span className={`flex min-w-0 items-center gap-2.5 ${columns ? "" : "flex-1"}`}>
              <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-full ${on ? "shadow-[inset_0_0_0_1px_theme(colors.accent)]" : "shadow-[inset_0_0_0_1px_theme(colors.edge)]"}`}>
                <span className={`size-2 rounded-full ${on ? "bg-accent" : ""}`} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-bright">{o.title}</span>
                {o.body && !columns && <span className="text-xs text-muted">{o.body}</span>}
              </span>
            </span>
            {o.body && columns && <span className="text-xs leading-normal text-muted">{o.body}</span>}
            {o.aside && <span className="whitespace-nowrap text-right font-mono text-xs text-fg">{o.aside}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Check({ children, name, defaultChecked, checked, onChange }: {
  children: ReactNode; name?: string; defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void;
}) {
  const bind = onChange ? { checked: !!checked, onChange: (e: { target: { checked: boolean } }) => onChange(e.target.checked) } : { defaultChecked };
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-normal text-fg">
      <input type="checkbox" name={name} {...bind} className="mt-[3px] size-4 shrink-0 accent-accent" />
      <span>{children}</span>
    </label>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-[1_1_24rem] flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="text-[clamp(26px,3vw,32px)] font-medium leading-[1.2] tracking-[-0.015em] text-bright">{title}</h1>
        <p className="max-w-[62ch] text-pretty text-sm leading-normal text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/** Main column + side column; the side drops below the main column when there is no room. */
export function Split({ children, side, sticky }: { children: ReactNode; side?: ReactNode; sticky?: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_34rem] flex-col gap-6">{children}</div>
      {side && <aside className={`flex min-w-0 flex-[1_1_280px] flex-col gap-6 ${sticky ? "lg:sticky lg:top-[84px]" : ""}`}>{side}</aside>}
    </div>
  );
}

/** Hairline grid: 0.5px gaps show the line colour between cells. 4 → 2 → 1 columns; 3 → 1. */
function HairGrid({ count, children, as: Tag = "div", label }: { count: number; children: ReactNode; as?: "div" | "ol"; label?: string }) {
  const cols = count >= 4 ? "min-[440px]:grid-cols-2 xl:grid-cols-4" : count === 3 ? "md:grid-cols-3" : count === 2 ? "sm:grid-cols-2" : "";
  return (
    <Tag aria-label={label} className={`grid grid-cols-1 gap-[0.5px] overflow-hidden rounded-xl border-[0.5px] border-line bg-line ${cols}`}>
      {children}
    </Tag>
  );
}

export type Metric = { label: ReactNode; value: ReactNode; note: ReactNode };

export function Metrics({ items }: { items: Metric[] }) {
  return (
    <HairGrid count={items.length}>
      {items.map((m, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-2 bg-surface px-6 py-5">
          <p className="text-xs text-muted">{m.label}</p>
          <p className="break-words font-mono text-[clamp(18px,2.2vw,25px)] leading-[1.3] text-bright">{m.value}</p>
          <p className="text-xs text-faint">{m.note}</p>
        </div>
      ))}
    </HairGrid>
  );
}

export type Stage = { label: string; title: string; note: string; state?: "done" | "now" | "todo"; tag?: string };

/** Lifecycle strip. A stage without `state` counts as done, except the last (current). */
export function Lifecycle({ stages, label }: { stages: Stage[]; label?: string }) {
  return (
    <HairGrid count={stages.length} as="ol" label={label}>
      {stages.map((s, i) => {
        const state = s.state ?? (i === stages.length - 1 ? "now" : "done");
        return (
          <li key={s.label} aria-current={state === "now" ? "step" : undefined}
            className={`flex min-w-0 flex-col gap-2.5 px-5 py-[18px] ${state === "now" ? "bg-raised" : "bg-surface"}`}>
            <div className="flex items-center justify-between gap-2 font-mono">
              <span className="text-[11px] text-muted">{s.label}</span>
              {s.tag && <span className={`text-[10px] ${state === "now" ? "text-accent" : "text-muted"}`}>{s.tag}</span>}
            </div>
            <p className="break-words text-base font-medium text-bright">{s.title}</p>
            <p className="text-xs leading-normal text-muted">{s.note}</p>
            <span className={`mt-auto block h-0.5 rounded-sm ${state === "now" ? "bg-accent" : state === "done" ? "bg-muted" : "bg-line"}`} />
          </li>
        );
      })}
    </HairGrid>
  );
}

/** Numbered stepper. Steps before `current` show ✓. `horizontal` = progress bars over labels; `links` make reachable steps clickable. */
export function Steps({ steps, current, horizontal, links }: { steps: string[]; current: number; horizontal?: boolean; links?: (string | null)[] }) {
  if (horizontal) {
    return (
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "current" : "todo";
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
              <span className={`block h-0.5 rounded-sm transition-colors duration-200 ${state === "done" ? "bg-muted" : state === "current" ? "bg-accent" : "bg-line"}`} />
              <span className={`flex min-w-0 items-center gap-2 text-xs ${state === "current" ? "text-bright" : state === "done" ? "text-fg" : "text-faint"}`}>
                <span className={`font-mono text-[11px] ${state === "current" ? "text-accent" : "text-faint"}`}>{state === "done" ? "✓" : String(n).padStart(2, "0")}</span>
                <span className={`truncate ${state === "current" ? "" : "max-sm:hidden"}`}>{label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        const href = links?.[i];
        const body = (
          <>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${
                state === "current" ? "bg-accent text-canvas" : state === "done" ? "text-bright shadow-[inset_0_0_0_1px_theme(colors.muted)]" : "text-faint shadow-[inset_0_0_0_1px_theme(colors.edge)]"
              }`}
            >
              {state === "done" ? "✓" : String(n).padStart(2, "0")}
            </span>
            {label}
          </>
        );
        const cls = `flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors ${
          state === "current" ? "bg-raised text-bright" : state === "done" ? "text-fg" : "text-faint"
        }`;
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined}>
            {href ? <Link href={href} className={`${cls} hover:text-bright`}>{body}</Link> : <span className={cls}>{body}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Compact checklist (application journey, interview sections). */
export function Checklist({ items }: { items: { label: string; state: "done" | "current" | "todo" }[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={it.label} aria-current={it.state === "current" ? "step" : undefined}
          className={`flex items-center gap-2.5 text-[13px] ${it.state === "todo" ? "text-muted" : it.state === "current" ? "text-bright" : "text-fg"}`}>
          <span className={`flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${
            it.state === "current" ? "bg-accent text-canvas" : it.state === "done" ? "text-bright shadow-[inset_0_0_0_1px_theme(colors.muted)]" : "text-faint shadow-[inset_0_0_0_1px_theme(colors.edge)]"
          }`}>
            {it.state === "done" ? "✓" : it.state === "current" ? String(i + 1) : ""}
          </span>
          {it.label}
        </li>
      ))}
    </ol>
  );
}

/** A cell is a node, or an array of lines. First column renders sans/bright, the rest mono. */
export type Cell = ReactNode | string[];

export function DataTable({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border-[0.5px] border-line">
      <table className="w-full border-collapse text-left">
        <thead className="bg-raised">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-[11px] font-normal leading-normal text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-t-[0.5px] border-line ${i % 2 ? "bg-[#0c0d0e]" : "bg-surface"}`}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3.5 align-middle leading-[1.6] ${j === 0 ? "text-[13px] text-bright" : "font-mono text-xs text-muted"}`}
                >
                  {Array.isArray(cell) ? cell.map((line, k) => <span key={k} className={`block ${k === 0 && j > 0 ? "text-fg" : ""}`}>{line}</span>) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ruled list inside a panel (milestones, backings). */
export function RowList({ children, ordered }: { children: ReactNode; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return <Tag className="flex flex-col overflow-hidden rounded-lg border-[0.5px] border-line [&>li+li]:border-t-[0.5px] [&>li+li]:border-line">{children}</Tag>;
}

/** One reflowing row of a RowList. `current` lifts the active row. */
export function Row({ children, current, min = "9rem" }: { children: ReactNode; current?: boolean; min?: string }) {
  return (
    <li className={`grid items-center gap-x-4 gap-y-2 px-4 py-3.5 ${current ? "bg-[#131415]" : "bg-surface even:bg-[#0c0d0e]"}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))` }}>
      {children}
    </li>
  );
}

/** Two-line cell: primary over a quiet mono note. */
export function Pair({ top, sub, mono }: { top: ReactNode; sub?: ReactNode; mono?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-[3px]">
      <span className={mono ? "font-mono text-xs text-fg" : "text-[13px] text-bright"}>{top}</span>
      {sub && <span className="break-words font-mono text-[11px] text-faint">{sub}</span>}
    </span>
  );
}

/** Clickable card row (commitments, applicants, claims). */
export function CardLink({ href, children, highlight, min = "10rem" }: { href: string; children: ReactNode; highlight?: boolean; min?: string }) {
  return (
    <Link href={href}
      className={`grid items-center gap-x-6 gap-y-3.5 rounded-xl border-[0.5px] bg-surface px-5 py-[18px] transition-colors duration-150 hover:border-edge hover:bg-[#121314] ${highlight ? "border-edge" : "border-line"}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))` }}>
      {children}
    </Link>
  );
}

/** Thin progress bar. */
export function Bar({ pct, accent }: { pct: number; accent?: boolean }) {
  return (
    <span className="block h-1 overflow-hidden rounded-sm bg-line">
      <span className={`block h-full ${accent ? "bg-accent" : "bg-muted"}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

export function Avatar({ initials, size = 40, square }: { initials: string; size?: number; square?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-raised font-medium text-fg shadow-[inset_0_0_0_0.5px_theme(colors.edge)] ${square ? "rounded-[10px]" : "rounded-full"}`}
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
    >
      {initials}
    </span>
  );
}

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
