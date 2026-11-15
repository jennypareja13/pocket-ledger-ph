import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/app/bits";
import { formatPeriodLabel, shiftPeriodAnchor, type DatePeriod } from "@/lib/dates";

export function PeriodFilter({
  period,
  anchor,
  onPeriodChange,
  onAnchorChange,
}: {
  period: DatePeriod;
  anchor: string;
  onPeriodChange: (period: DatePeriod) => void;
  onAnchorChange: (anchor: string) => void;
}) {
  const label = formatPeriodLabel(period, anchor);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Period
        <Select
          aria-label="Date period"
          className="h-9 min-w-28"
          value={period}
          onChange={(event) => onPeriodChange(event.target.value as DatePeriod)}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </Select>
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Choose date
        <Input
          aria-label="Anchor date"
          className="h-9"
          type="date"
          value={anchor}
          onChange={(event) => {
            if (event.target.value) onAnchorChange(event.target.value);
          }}
        />
      </label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Previous period"
          onClick={() => onAnchorChange(shiftPeriodAnchor(period, anchor, -1))}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Next period"
          onClick={() => onAnchorChange(shiftPeriodAnchor(period, anchor, 1))}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <p
        className="w-full text-xs text-muted-foreground sm:w-auto sm:self-center"
        aria-live="polite"
      >
        {label}
      </p>
    </div>
  );
}
