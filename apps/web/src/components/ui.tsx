import type { ReactNode } from "react";
import { formatTimestamp } from "../lib/format";

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-fg-0">{title}</h1>
        {subtitle ? <div className="mt-1 text-fg-2">{subtitle}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  className = "",
  id,
  bodyClassName = "p-3",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={`rounded-[4px] border border-line bg-surface-1 ${className}`}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="text-[12px] font-semibold tracking-wide text-fg-1 uppercase">{title}</h2>
          {aside ? <div className="flex flex-wrap items-center gap-2 text-fg-2">{aside}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Monospace identifier / path / hash. Long values wrap rather than overflow. */
export function Mono({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`font-mono text-[12px] break-all ${className}`}>
      {children}
    </span>
  );
}

export function Time({ iso, className = "" }: { iso: string | null | undefined; className?: string }) {
  return (
    <time dateTime={iso ?? undefined} title={iso ?? undefined} className={`font-mono text-[12px] whitespace-nowrap ${className}`}>
      {formatTimestamp(iso)}
    </time>
  );
}

export function KeyValue({ items, className = "" }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={`grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 ${className}`}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="label pt-0.5">{k}</dt>
          <dd className="min-w-0 text-fg-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, breakdown }: { label: string; value: number; breakdown?: ReactNode }) {
  return (
    <div className="min-w-[120px] border-l border-line px-3 py-1 first:border-l-0">
      <div className="label">{label}</div>
      <div className="font-mono text-[20px] leading-7 font-semibold text-fg-0">{value}</div>
      {breakdown ? <div className="text-[11px] text-fg-2">{breakdown}</div> : null}
    </div>
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
