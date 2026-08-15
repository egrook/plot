import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDueOn, parseDueValue, toDueValue } from "@/lib/plan";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function DueDateTimePicker({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const parsed = parseDueValue(value);
  const selected = parsed?.date;
  const time = parsed?.hasTime
    ? `${String(selected!.getHours()).padStart(2, "0")}:${String(selected!.getMinutes()).padStart(2, "0")}`
    : parsed
      ? "09:00"
      : "09:00";

  function commit(date: Date, nextTime = time) {
    const [hour, minute] = nextTime.split(":").map(Number);
    const next = new Date(date);
    next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
    onChange(toDueValue(next));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-start font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="text-muted-foreground size-3.5" />
          {value && parsed ? formatDueOn(value) : "Pick date & time"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            commit(date);
          }}
        />
        <div className="flex items-center gap-2 border-t px-3 py-2.5">
          <label className="text-muted-foreground text-xs font-medium" htmlFor="due-time">
            Time
          </label>
          <input
            id="due-time"
            type="time"
            value={parsed ? time : ""}
            disabled={disabled || !parsed}
            className="border-input bg-background h-8 flex-1 rounded-md border px-2 text-sm"
            onChange={(event) => {
              if (!selected || !event.target.value) return;
              commit(selected, event.target.value);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
