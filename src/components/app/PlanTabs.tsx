import { Link, useLocation } from "@tanstack/react-router";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { bnplEnabled } from "@/lib/bnpl-actions";
import { mainSpaces } from "@/lib/selectors";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/budgets", label: "Budgets" },
  { to: "/bnpl", label: "BNPL" },
  { to: "/loans", label: "Owed to me" },
] as const;

export function PlanTabs() {
  const location = useLocation();
  const { snap } = useApp();
  const { space } = useSpace();
  const showBnpl =
    !!space &&
    mainSpaces(snap.spaces).some((item) => item.id === space.id) &&
    bnplEnabled(snap, space.id);

  return (
    <nav
      aria-label="Plan pages"
      className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border/80 bg-muted/50 p-1"
    >
      {TABS.filter((tab) => tab.to !== "/bnpl" || showBnpl).map(({ to, label }) => {
        const active = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
