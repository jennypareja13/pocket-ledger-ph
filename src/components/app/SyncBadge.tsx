import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CloudOff, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "./AppProvider";
import { formatDateTime } from "@/lib/dates";

export function useSyncSummary() {
  const { auth, online, sync, snap } = useApp();
  if (auth.status === "guest")
    return {
      icon: HardDrive,
      label: "Device only",
      detail: "Not signed in — data stays on this device.",
      tone: "muted" as const,
    };
  if (snap.conflicts.length)
    return {
      icon: AlertTriangle,
      label: `${snap.conflicts.length} conflict${snap.conflicts.length > 1 ? "s" : ""}`,
      detail: "Review in Settings.",
      tone: "bad" as const,
    };
  if (!online)
    return {
      icon: CloudOff,
      label: snap.pending ? `Offline · ${snap.pending} waiting` : "Offline",
      detail: "Changes are saved on this device and will sync when you're back online.",
      tone: "warn" as const,
    };
  if (sync.running)
    return { icon: Loader2, label: "Syncing…", detail: "", tone: "muted" as const, spin: true };
  if (sync.error)
    return {
      icon: AlertTriangle,
      label: snap.pending ? `Sync error · ${snap.pending} waiting` : "Sync error",
      detail: `${sync.error}. Your local data is safe; retrying automatically.`,
      tone: "bad" as const,
    };
  if (snap.pending)
    return {
      icon: RefreshCw,
      label: `${snap.pending} pending`,
      detail: "Uploading shortly.",
      tone: "warn" as const,
    };
  return {
    icon: CheckCircle2,
    label: "All synced",
    detail: sync.lastSyncedAt ? `Last synced ${formatDateTime(sync.lastSyncedAt)}` : "",
    tone: "good" as const,
  };
}

export function SyncBadge({ className }: { className?: string }) {
  const s = useSyncSummary();
  const Icon = s.icon;
  return (
    <Link
      to="/settings"
      title={s.detail}
      aria-label={`Sync status: ${s.label}. ${s.detail}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        s.tone === "good" && "border-primary/20 bg-primary-soft text-accent-foreground",
        s.tone === "warn" && "border-warning/30 bg-warning-soft text-foreground",
        s.tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
        s.tone === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("size-3.5", "spin" in s && s.spin && "animate-spin")} />
      {s.label}
    </Link>
  );
}
