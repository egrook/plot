import { useEffect, useMemo, useRef, useState } from "react";
import { File as FileIcon, FileText, ImageIcon, PenLine, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchSpaces } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { SpaceNode, SpaceType } from "@/types";

function TypeIcon({ type }: { type: SpaceType }) {
  if (type === "markdown") return <FileText className="text-primary size-3.5" />;
  if (type === "image") return <ImageIcon className="text-muted-foreground size-3.5" />;
  if (type === "file") return <FileIcon className="text-muted-foreground size-3.5" />;
  return <PenLine className="text-muted-foreground size-3.5" />;
}

function typeLabel(type: SpaceType) {
  if (type === "markdown") return "Note";
  if (type === "image") return "Image";
  if (type === "file") return "File";
  return "Drawing";
}

type Props = {
  spaces: SpaceNode[];
  onJump: (nodeId: string) => void;
  enabled?: boolean;
};

export function BoardSearch({ spaces, onJump, enabled = true }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => searchSpaces(spaces, query), [spaces, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") {
        return;
      }
      event.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        if (!query.trim()) setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open, query]);

  function jump(nodeId: string) {
    onJump(nodeId);
  }

  if (!open) {
    return (
      <div className="nodrag nopan nowheel">
        <Button
          size="sm"
          variant="secondary"
          className="bg-card/95 shadow-lg backdrop-blur"
          onClick={() => setOpen(true)}
        >
          <Search />
          Search
          <kbd className="text-muted-foreground ml-1 hidden rounded border px-1 py-px font-mono text-[10px] sm:inline">
            ⌘F
          </kbd>
        </Button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="nodrag nopan nowheel w-[min(22rem,calc(100vw-2rem))]">
      <div className="bg-card/95 rounded-xl border shadow-lg backdrop-blur">
        <div className="flex items-center gap-1 p-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this board…"
              className="h-8 border-transparent bg-transparent pr-8 pl-8 shadow-none"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (query) {
                    setQuery("");
                    return;
                  }
                  setOpen(false);
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((current) =>
                    hits.length === 0 ? 0 : (current + 1) % hits.length,
                  );
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((current) =>
                    hits.length === 0
                      ? 0
                      : (current - 1 + hits.length) % hits.length,
                  );
                  return;
                }
                if (event.key === "Enter" && hits[active]) {
                  event.preventDefault();
                  jump(hits[active].id);
                }
              }}
            />
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
          >
            <X />
          </Button>
        </div>
        {query.trim() ? (
          <div className="thin-scroll max-h-72 overflow-y-auto border-t p-1">
            {hits.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              hits.map((hit, index) => (
                <button
                  key={hit.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    index === active ? "bg-accent" : "hover:bg-accent/70",
                  )}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => jump(hit.id)}
                >
                  <span className="mt-0.5 shrink-0">
                    <TypeIcon type={hit.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {hit.title}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-[10px] uppercase tracking-wide">
                        {typeLabel(hit.type)}
                      </span>
                    </span>
                    {hit.snippet ? (
                      <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                        {hit.snippet}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <p className="text-muted-foreground border-t px-3 py-2 text-xs">
            Titles, note text, and drawing text. Click a result to jump there.
          </p>
        )}
      </div>
    </div>
  );
}
