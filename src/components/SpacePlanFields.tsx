import { Label } from "@/components/ui/label";
import { SPACE_STATUSES, spaceStatusLabel } from "@/lib/plan";
import type { SpaceStatus } from "@/types";

type Props = {
  status: SpaceStatus | "";
  dueOn: string;
  disabled?: boolean;
  onStatus: (status: SpaceStatus | "") => void;
  onDueOn: (dueOn: string) => void;
};

export function SpacePlanFields({
  status,
  dueOn,
  disabled,
  onStatus,
  onDueOn,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="space-status">Status</Label>
        <select
          id="space-status"
          value={status}
          disabled={disabled}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          onChange={(event) => onStatus(event.target.value as SpaceStatus | "")}
        >
          <option value="">No status</option>
          {SPACE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {spaceStatusLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="space-due">Due</Label>
        <input
          id="space-due"
          type="date"
          value={dueOn}
          disabled={disabled}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          onChange={(event) => onDueOn(event.target.value)}
        />
      </div>
    </div>
  );
}
