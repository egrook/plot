import type { SpaceNode, SpaceType } from "@/types";

export type BoardHit = {
  id: string;
  title: string;
  type: SpaceType;
  snippet: string;
  inTitle: boolean;
};

export function extractExcalidrawText(content: string) {
  try {
    const data = JSON.parse(content);
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const parts: string[] = [];
    for (const element of elements) {
      if (!element || typeof element !== "object") continue;
      if (typeof element.text === "string") parts.push(element.text);
      if (typeof element.originalText === "string") {
        parts.push(element.originalText);
      }
      const label = (element as { label?: { text?: unknown } }).label;
      if (label && typeof label.text === "string") parts.push(label.text);
    }
    return parts.join(" ");
  } catch {
    return "";
  }
}

export function spaceBody(space: SpaceNode) {
  if (space.type === "excalidraw") return extractExcalidrawText(space.content);
  if (space.type === "image" || space.type === "file") return "";
  return space.content;
}

export function snippetAround(text: string, query: string) {
  const hay = text.replace(/\s+/g, " ").trim();
  const index = hay.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return hay.slice(0, 140);
  const start = Math.max(0, index - 36);
  const end = Math.min(hay.length, index + query.length + 72);
  return `${start > 0 ? "…" : ""}${hay.slice(start, end)}${end < hay.length ? "…" : ""}`;
}

export function spaceMatchesQuery(space: SpaceNode, rawQuery: string) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if ((space.title || "").toLowerCase().includes(q)) return true;
  return spaceBody(space).toLowerCase().includes(q);
}

export function searchSpaces(spaces: SpaceNode[], rawQuery: string): BoardHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const hits: BoardHit[] = [];
  for (const space of spaces) {
    const title = space.title || "Untitled";
    const body = spaceBody(space);
    const inTitle = title.toLowerCase().includes(q);
    const inBody = body.toLowerCase().includes(q);
    if (!inTitle && !inBody) continue;
    hits.push({
      id: space.id,
      title,
      type: space.type,
      snippet: inBody ? snippetAround(body, rawQuery.trim()) : "",
      inTitle,
    });
  }
  hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
  return hits.slice(0, 30);
}
