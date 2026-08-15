import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDueOn, isOverdue, spaceStatusLabel } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type { SpaceStatus } from "@/types";

type Props = {
  status: SpaceStatus | "";
  dueOn: string;
  className?: string;
};

export function SpacePlanBadges({ status, dueOn, className }: Props) {
  if (!status && !dueOn) return null;
  const overdue = isOverdue(dueOn, status);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {status ? (
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            status === "doing" && "bg-sky-500/15 text-sky-300",
            status === "blocked" && "bg-amber-500/15 text-amber-300",
            status === "done" && "bg-emerald-500/15 text-emerald-300",
          )}
        >
          {spaceStatusLabel(status)}
        </Badge>
      ) : null}
      {dueOn ? (
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            overdue && "bg-destructive/15 text-destructive",
          )}
        >
          <Calendar className="size-2.5" />
          {overdue ? "Overdue " : ""}
          {formatDueOn(dueOn)}
        </Badge>
      ) : null}
    </div>
  );
}
