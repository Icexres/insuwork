import Link from "next/link";
import type { ReactNode } from "react";

// Primitives shared by every InsuWork screen (Figma file HHtxYF9Hd5aFDJFGKBzym4).

export type IconName =
  | "layers"
  | "layout-dashboard"
  | "folder"
  | "list-checks"
  | "bell"
  | "circle-help"
  | "arrow-right"
  | "arrow-up";

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/icons/${name}.svg`} alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block shrink-0 whitespace-nowrap rounded border-[0.5px] border-edge bg-raised px-2 py-1 font-mono text-[10px] leading-[1.3] text-fg">
      {children}
    </span>
  );
}

type ButtonProps = {
  children: ReactNode;
  primary?: boolean;
  icon?: IconName;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** submit button inside a <form action={serverAction}> */
  submit?: boolean;
};

export function Button({ children, primary, icon, href, onClick, disabled, submit }: ButtonProps) {
  const cls = `inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md border-[0.5px] px-4 py-[11px] text-[13px] font-medium disabled:opacity-50 ${
    primary ? "border-accent bg-accent text-canvas" : "border-line bg-raised text-fg"
  }`;
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

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] leading-normal text-muted">{children}</p>;
}

export function Divider() {
  return <hr className="w-full border-0 border-t-[0.5px] border-line" />;
}

export function Panel({
  title,
  badge,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-5 rounded-xl border-[0.5px] border-line bg-surface p-6 ${className}`}>
      {(title || badge || action) && (
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-white">{title}</h2>
          {badge && <Badge>{badge}</Badge>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-md border-y-[0.5px] border-l-2 border-r-[0.5px] border-edge bg-surface p-4 leading-normal">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="text-[13px] text-muted">{children}</p>
    </div>
  );
}

/** Label left, mono value right. */
export function Detail({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex-1 text-sm leading-normal text-muted">{label}</span>
      <span className="w-[150px] text-right font-mono text-xs leading-[1.6] text-fg">{value}</span>
    </div>
  );
}

/** Stacked label over value. `mono` = sans label + mono value (panelist style); default = mono eyebrow + sans value. */
export function Fact({ label, value, mono }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 leading-normal">
      {mono ? <p className="text-xs text-muted">{label}</p> : <Eyebrow>{label}</Eyebrow>}
      <p className={mono ? "font-mono text-xs leading-[1.6] text-fg" : "text-[13px] text-fg"}>{value}</p>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border-[0.5px] border-edge bg-surface p-3 text-sm leading-normal text-fg placeholder:text-faint focus:border-muted focus:outline-none";

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
  className?: string;
}) {
  const bind = onChange
    ? { value: value ?? "", onChange: (e: { target: { value: string } }) => onChange(e.target.value) }
    : { defaultValue: value };
  const common = { name, ...bind };
  return (
    <label className={`flex min-w-0 flex-1 flex-col gap-2 ${className}`}>
      <span className="text-xs leading-normal text-muted">{label}</span>
      {options ? (
        <select {...common} className={`${inputCls} min-h-[44px]`}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      ) : rows ? (
        <textarea rows={rows} {...common} placeholder={placeholder} className={`${inputCls} resize-none`} />
      ) : (
        <input {...common} type={type} inputMode={inputMode} placeholder={placeholder} className={`${inputCls} min-h-[44px]`} />
      )}
    </label>
  );
}

export function Check({ children, name, defaultChecked, checked, onChange }: {
  children: ReactNode; name?: string; defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void;
}) {
  const bind = onChange ? { checked: !!checked, onChange: (e: { target: { checked: boolean } }) => onChange(e.target.checked) } : { defaultChecked };
  return (
    <label className="flex items-start gap-2 text-[13px] leading-normal text-fg">
      <input type="checkbox" name={name} {...bind} className="mt-[3px] accent-accent" />
      {children}
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
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="text-[32px] font-medium leading-[1.2] text-white">{title}</h1>
        <p className="text-sm leading-normal text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/** Main column + 320px side column. */
export function Split({ children, side }: { children: ReactNode; side?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      {side && <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-[320px]">{side}</aside>}
    </div>
  );
}

export type Metric = { label: ReactNode; value: ReactNode; note: ReactNode };

/** Metric row. `cards` = separate rounded cards; default = one joined strip. */
export function Metrics({ items, cards }: { items: Metric[]; cards?: boolean }) {
  return (
    <div className={`flex flex-wrap ${cards ? "gap-6" : "overflow-hidden rounded-xl border-[0.5px] border-line"}`}>
      {items.map((m, i) => (
        <div
          key={i}
          className={`flex min-w-[200px] flex-1 flex-col gap-2.5 bg-surface p-6 leading-normal ${
            cards ? "rounded-xl border-[0.5px] border-line" : "border-r-[0.5px] border-line last:border-r-0"
          }`}
        >
          <p className="text-xs text-muted">{m.label}</p>
          <p className="font-mono text-[25px] leading-[1.3] text-white">{m.value}</p>
          <p className="text-xs text-muted">{m.note}</p>
        </div>
      ))}
    </div>
  );
}

export type Stage = { label: string; title: string; note: string };

/** Lifecycle strip; the last stage is the current one. `bare` drops the outer frame. */
export function Lifecycle({ stages, bare }: { stages: Stage[]; bare?: boolean }) {
  return (
    <div className={`flex flex-wrap ${bare ? "gap-6" : "overflow-hidden rounded-xl border-[0.5px] border-edge"}`}>
      {stages.map((s, i) => {
        const current = i === stages.length - 1;
        return (
          <div
            key={s.label}
            className={`flex min-w-[160px] flex-1 flex-col gap-3 border-r-[0.5px] border-line p-5 leading-normal ${current ? "bg-raised" : "bg-surface"}`}
          >
            <Eyebrow>{s.label}</Eyebrow>
            <p className="text-[17px] font-medium text-fg">{s.title}</p>
            <p className="text-xs text-muted">{s.note}</p>
            <div className={`h-[2px] w-full ${current ? "bg-fg" : "bg-edge"}`} />
          </div>
        );
      })}
    </div>
  );
}

/** Numbered stepper. Steps before `current` show ✓. */
export function Steps({ steps, current, horizontal }: { steps: string[]; current: number; horizontal?: boolean }) {
  return (
    <ol className={horizontal ? "flex flex-wrap" : "flex flex-col gap-2"}>
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex border-[0.5px] ${
              horizontal ? "min-w-[140px] flex-1 flex-col items-start gap-3 p-4" : "items-center gap-3 rounded-md p-3"
            } ${state === "current" ? "border-edge bg-raised" : "border-line bg-surface"}`}
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border border-edge font-mono text-[11px] ${
                state === "todo" && !horizontal ? "text-faint" : "text-white"
              }`}
            >
              {state === "done" ? "✓" : String(n).padStart(2, "0")}
            </span>
            <span className={`text-xs leading-normal ${state === "current" ? "text-white" : "text-muted"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A cell is a node, or an array of lines. First column renders sans/fg, the rest mono/muted. */
export type Cell = ReactNode | string[];

export function DataTable({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  return (
    <div className="w-full overflow-x-auto rounded-md border-[0.5px] border-line">
      <table className="w-full border-collapse text-left">
        <thead className="bg-raised">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-4 py-3 text-[11px] font-normal leading-normal text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b-[0.5px] border-line ${i % 2 ? "bg-canvas" : "bg-surface"}`}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-[18px] align-middle leading-[1.6] ${j === 0 ? "text-[13px] text-fg" : "font-mono text-xs text-muted"}`}
                >
                  {Array.isArray(cell) ? cell.map((line) => <span key={line} className="block">{line}</span>) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Avatar({ initials, size = 40, square }: { initials: string; size?: number; square?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center border-[0.5px] border-edge bg-raised font-medium text-fg ${square ? "rounded-lg" : "rounded-full"}`}
      style={{ width: size, height: size, fontSize: size / 3 }}
    >
      {initials}
    </span>
  );
}
