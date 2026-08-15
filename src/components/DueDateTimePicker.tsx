import { useRef, useState } from "react";
import { CalendarIcon, Clock } from "lucide-react";
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
  const timeRef = useRef<HTMLInputElement>(null);
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
          <div className="relative min-w-0 flex-1">
            <input
              ref={timeRef}
              id="due-time"
              type="time"
              value={parsed ? time : ""}
              disabled={disabled || !parsed}
              className="time-input border-input bg-background h-8 w-full rounded-md border py-0 pr-8 pl-2 text-sm"
              onChange={(event) => {
                if (!selected || !event.target.value) return;
                commit(selected, event.target.value);
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled || !parsed}
              aria-label="Show time picker"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2 disabled:opacity-40"
              onClick={() => {
                const input = timeRef.current;
                if (!input) return;
                if (typeof input.showPicker === "function") input.showPicker();
                else input.focus();
              }}
            >
              <Clock className="size-3.5" />
            </button>
          </div>
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
