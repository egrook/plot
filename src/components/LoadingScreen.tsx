import { Loader2 } from "lucide-react";

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="bg-background text-muted-foreground flex h-full min-h-svh flex-col items-center justify-center gap-3">
      <Loader2 className="text-primary size-5 animate-spin" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
