import { useEffect, useState } from "react";

export type ToastVariant = "default" | "success" | "destructive";

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, number>();
let lastKey = "";
let lastAt = 0;

function emit() {
  for (const listener of listeners) listener(toasts);
}

export function dismissToast(id: string) {
  toasts = toasts.filter((item) => item.id !== id);
  const timer = timers.get(id);
  if (timer) window.clearTimeout(timer);
  timers.delete(id);
  emit();
}

function show(input: {
  title: string;
  description?: string;
  variant?: ToastVariant;
}) {
  const variant = input.variant ?? "default";
  const key = `${variant}:${input.title}:${input.description ?? ""}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < 2200) return;
  lastKey = key;
  lastAt = now;

  const item: ToastItem = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    variant,
  };
  toasts = [...toasts.filter((toast) => toast.title !== item.title), item].slice(
    -3,
  );
  emit();
  timers.set(
    item.id,
    window.setTimeout(() => dismissToast(item.id), 4200),
  );
}

export const toast = Object.assign(
  (title: string, description?: string) =>
    show({ title, description, variant: "default" }),
  {
    success: (title: string, description?: string) =>
      show({ title, description, variant: "success" }),
    error: (title: string, description?: string) =>
      show({ title, description, variant: "destructive" }),
  },
);

export function toastFromError(err: unknown, fallback = "Something went wrong.") {
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status: unknown }).status)
      : 0;
  if (status === 401 || status === 403) return;
  toast.error(err instanceof Error ? err.message : fallback);
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>(toasts);
  useEffect(() => subscribeToasts(setItems), []);
  return items;
}
