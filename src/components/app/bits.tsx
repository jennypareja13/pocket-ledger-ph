import type { ReactNode, SelectHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPHP, formatSignedPHP } from "@/lib/money";
import type { SyncState } from "@/lib/types";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-medium text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-soft", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: ReactNode; tone?: "income" | "expense" | "net" | "managed" | undefined }) {
  const color =
    tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : tone === "managed" ? "text-managed"
      : tone === "net" ? (value < 0 ? "text-expense" : "text-income") : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("num mt-2 text-2xl font-semibold", color)}>{tone === "net" ? formatSignedPHP(value) : formatPHP(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center">
      <div className="mb-3 rounded-full bg-primary-soft p-3 text-primary [&_svg]:size-5">{icon}</div>
      <p className="font-medium text-foreground">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("field appearance-auto", props.className)} />;
}

export function SyncDot({ state }: { state: SyncState }) {
  const map = {
    synced: { icon: <CheckCircle2 />, label: "Synced", cls: "text-income" },
    pending: { icon: <Clock />, label: "Pending sync", cls: "text-warning" },
    error: { icon: <AlertTriangle />, label: "Sync error — will retry", cls: "text-expense" },
    conflict: { icon: <AlertTriangle />, label: "Conflict — review in Settings", cls: "text-expense" },
  }[state];
  return (
    <span title={map.label} aria-label={map.label} className={cn("inline-flex [&_svg]:size-3.5", map.cls)}>
      {map.icon}
    </span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function Bar({ pct, over }: { pct: number; over?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", over ? "bg-expense" : pct > 85 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
