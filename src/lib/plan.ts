import type { SpaceStatus } from "@/types";

export const SPACE_STATUSES: SpaceStatus[] = ["todo", "doing", "blocked", "done"];

export function spaceStatusLabel(status: SpaceStatus | "") {
  if (status === "doing") return "Doing";
  if (status === "blocked") return "Blocked";
  if (status === "done") return "Done";
  if (status === "todo") return "Todo";
  return "No status";
}

export function todayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isOverdue(dueOn: string, status: SpaceStatus | "") {
  if (!dueOn || status === "done") return false;
  return dueOn < todayIsoDate();
}

export function formatDueOn(dueOn: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return "";
  const [year, month, day] = dueOn.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}
