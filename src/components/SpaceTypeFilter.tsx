import { File as FileIcon, FileText, ImageIcon, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpaceType } from "@/types";

export type SpaceKindFilter = "all" | SpaceType;

const OPTIONS: {
  value: SpaceKindFilter;
  label: string;
  icon: typeof FileText | null;
}[] = [
  { value: "all", label: "All", icon: null },
  { value: "markdown", label: "Notes", icon: FileText },
  { value: "excalidraw", label: "Drawings", icon: PenLine },
  { value: "image", label: "Images", icon: ImageIcon },
  { value: "file", label: "Files", icon: FileIcon },
];

export function spaceKindLabel(kind: SpaceKindFilter) {
  return OPTIONS.find((option) => option.value === kind)?.label ?? "Spaces";
}

type Props = {
  value: SpaceKindFilter;
  onChange: (value: SpaceKindFilter) => void;
};

export function SpaceTypeFilter({ value, onChange }: Props) {
  return (
    <div className="bg-muted/50 flex rounded-lg border p-0.5">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            className={cn(
              "inline-flex h-7 min-w-0 flex-1 items-center justify-center rounded-md text-[11px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon className="size-3.5" /> : option.label}
          </button>
        );
      })}
    </div>
  );
}
