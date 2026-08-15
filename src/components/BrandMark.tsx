import { Link } from "react-router-dom";
import { useAuth } from "@/auth";
import { cn } from "@/lib/utils";

export function PlotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4", className)}
      aria-hidden="true"
    >
      <circle cx="5.5" cy="5.5" r="2" fill="currentColor" />
      <circle cx="18.5" cy="5.5" r="2" fill="currentColor" />
      <circle cx="5.5" cy="18.5" r="2" fill="currentColor" />
      <circle cx="18.5" cy="18.5" r="2" fill="currentColor" />
      <path
        d="M7.5 5.5h9M5.5 7.5v9M7.5 18.5h9M18.5 7.5v9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandMark({
  className,
  compact = false,
  to,
}: {
  className?: string;
  compact?: boolean;
  to?: string | null;
}) {
  const { user } = useAuth();
  const href = to === undefined ? (user ? "/dashboard" : "/") : to;
  const mark = (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="bg-primary/15 text-primary flex size-8 items-center justify-center rounded-md border border-primary/20">
        <PlotIcon />
      </span>
      {compact ? null : (
        <span className="text-[15px] font-semibold tracking-tight">Plot</span>
      )}
    </div>
  );
  if (!href) return mark;
  return (
    <Link
      to={href}
      className="hover:opacity-80"
      aria-label={user ? "Go to dashboard" : "Go to homepage"}
    >
      {mark}
    </Link>
  );
}
