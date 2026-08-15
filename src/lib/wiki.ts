import { visit } from "unist-util-visit";
import type { SpaceNode } from "@/types";

export const WIKI_PREFIX = "plot-wiki:";

const WIKI_RE = /\[\[([^[\]]+?)\]\]/g;
const SKIP = new Set(["code", "inlineCode", "link", "linkReference"]);

export function wikiHref(title: string) {
  return `${WIKI_PREFIX}${encodeURIComponent(title.trim())}`;
}

export function parseWikiHref(href: string | undefined) {
  if (!href?.startsWith(WIKI_PREFIX)) return null;
  try {
    return decodeURIComponent(href.slice(WIKI_PREFIX.length)).trim() || null;
  } catch {
    return href.slice(WIKI_PREFIX.length).trim() || null;
  }
}

export function findSpaceByTitle(spaces: SpaceNode[], rawTitle: string) {
  const title = rawTitle.trim().toLowerCase();
  if (!title) return null;
  const matches = spaces.filter(
    (space) => (space.title || "").trim().toLowerCase() === title,
  );
  if (matches.length === 0) return null;
  return (
    matches.find((space) => space.type === "markdown") ??
    matches[0]
  );
}

export function remarkWikiLinks() {
  return (tree: unknown) => {
    visit(
      tree as never,
      "text",
      (node: { value: string }, index: number | undefined, parent: { type: string; children: unknown[] } | undefined) => {
        if (!parent || index == null || SKIP.has(parent.type)) return;
        const value = node.value;
        if (!value.includes("[[")) return;
        WIKI_RE.lastIndex = 0;
        if (!WIKI_RE.test(value)) return;
        WIKI_RE.lastIndex = 0;
        const next: unknown[] = [];
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = WIKI_RE.exec(value))) {
          if (match.index > last) {
            next.push({ type: "text", value: value.slice(last, match.index) });
          }
          const title = match[1].trim();
          if (title) {
            next.push({
              type: "link",
              url: wikiHref(title),
              children: [{ type: "text", value: title }],
            });
          }
          last = match.index + match[0].length;
        }
        if (last < value.length) {
          next.push({ type: "text", value: value.slice(last) });
        }
        parent.children.splice(index, 1, ...next);
        return index + next.length;
      },
    );
  };
}
