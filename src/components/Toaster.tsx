import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { dismissToast, useToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useToasts();

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-[300] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => {
        const Icon =
          item.variant === "success"
            ? CircleCheck
            : item.variant === "destructive"
              ? CircleAlert
              : Info;
        return (
          <div
            key={item.id}
            role={item.variant === "destructive" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-lg backdrop-blur",
              "animate-in fade-in slide-in-from-bottom-2 duration-200",
              item.variant === "destructive"
                ? "border-destructive/30 bg-card text-foreground"
                : "bg-card/95",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                item.variant === "success" && "text-emerald-400",
                item.variant === "destructive" && "text-destructive",
                item.variant === "default" && "text-muted-foreground",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description ? (
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground cursor-pointer rounded-md p-0.5"
              onClick={() => dismissToast(item.id)}
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
