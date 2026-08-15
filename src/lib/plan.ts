import type { SpaceStatus } from "@/types";

export const SPACE_STATUSES: SpaceStatus[] = ["todo", "doing", "blocked", "done"];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function spaceStatusLabel(status: SpaceStatus | "") {
  if (status === "doing") return "Doing";
  if (status === "blocked") return "Blocked";
  if (status === "done") return "Done";
  if (status === "todo") return "Todo";
  return "No status";
}

export function parseDueValue(dueOn: string) {
  const dateTime = dueOn.match(DATETIME_RE);
  if (dateTime) {
    const [, year, month, day, hour, minute] = dateTime.map(Number);
    return {
      date: new Date(year, month - 1, day, hour, minute),
      hasTime: true,
    };
  }
  const dateOnly = dueOn.match(DATE_RE);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    return {
      date: new Date(year, month - 1, day, 23, 59),
      hasTime: false,
    };
  }
  return null;
}

export function toDueValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function dueTimeValue(dueOn: string) {
  const parsed = parseDueValue(dueOn);
  if (!parsed || !parsed.hasTime) return "09:00";
  const hour = String(parsed.date.getHours()).padStart(2, "0");
  const minute = String(parsed.date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function isOverdue(dueOn: string, status: SpaceStatus | "") {
  if (!dueOn || status === "done") return false;
  const parsed = parseDueValue(dueOn);
  if (!parsed) return false;
  return parsed.date.getTime() < Date.now();
}

export function formatDueOn(dueOn: string) {
  const parsed = parseDueValue(dueOn);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(parsed.hasTime
      ? { hour: "numeric", minute: "2-digit" }
      : {}),
  }).format(parsed.date);
}
