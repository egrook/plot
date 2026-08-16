import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { Maximize2, PenLine } from "lucide-react";
import { NodeHandles } from "@/components/NodeHandles";
import { SpacePlanBadges } from "@/components/SpacePlanBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpaceNodeData } from "@/types";

export type DrawingFlowNode = Node<SpaceNodeData, "drawing">;

export default function DrawingNode({ data, selected }: NodeProps<DrawingFlowNode>) {
  return (
    <article
      className={cn(
        "bg-card flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-lg",
        data.borderColor && "border-2",
        selected && "ring-primary ring-2 ring-offset-2 ring-offset-background",
      )}
      style={data.borderColor ? { borderColor: data.borderColor } : undefined}
    >
      <NodeResizer
        minWidth={260}
        minHeight={180}
        isVisible={selected && !data.readOnly}
        color="#a1a1aa"
        onResizeEnd={(_event, params) => data.onResize(params.width, params.height)}
      />
      <NodeHandles readOnly={data.readOnly} />
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <Badge variant="secondary" className="text-[10px]">
            Drawing
          </Badge>
          <h3 className="font-serif mt-1 truncate text-base leading-tight">
            {data.title || "Untitled drawing"}
          </h3>
          <SpacePlanBadges status={data.status} dueOn={data.dueOn} className="mt-1" />
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="nodrag nopan"
          onClick={data.onOpen}
        >
          <Maximize2 />
        </Button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden" onDoubleClick={data.onOpen}>
        {data.preview ? (
          <img
            className="bg-background size-full object-contain"
            src={data.preview}
            alt=""
          />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm">
            <PenLine className="size-5 opacity-60" />
            {data.readOnly
              ? "Empty drawing."
              : "Empty board. Double-click to sketch with Excalidraw."}
          </div>
        )}
      </div>
    </article>
  );
}
