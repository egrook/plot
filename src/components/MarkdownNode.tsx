import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { Maximize2 } from "lucide-react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { SpacePlanBadges } from "@/components/SpacePlanBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpaceNodeData } from "@/types";

export type MarkdownFlowNode = Node<SpaceNodeData, "markdown">;

export default function MarkdownNode({ data, selected }: NodeProps<MarkdownFlowNode>) {
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
        minWidth={240}
        minHeight={180}
        isVisible={selected && !data.readOnly}
        color="#a1a1aa"
        onResizeEnd={(_event, params) => data.onResize(params.width, params.height)}
      />
      {data.readOnly ? null : (
        <>
          <Handle className="handle" type="target" id="left" position={Position.Left} />
          <Handle className="handle" type="source" id="right" position={Position.Right} />
          <Handle className="handle" type="target" id="top" position={Position.Top} />
          <Handle className="handle" type="source" id="bottom" position={Position.Bottom} />
        </>
      )}
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <Badge variant="secondary" className="text-[10px]">
            Note
          </Badge>
          <h3 className="mt-1 truncate text-base leading-tight">
            {data.title || "Untitled note"}
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
        <div className="h-full px-3.5 py-2">
          {data.content ? (
            <MarkdownBody source={data.content} onWikiLink={data.onWikiLink} />
          ) : (
            <p className="text-muted-foreground">
              {data.readOnly ? "Empty note." : "Double-click to write."}
            </p>
          )}
        </div>
        <div className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t to-transparent" />
      </div>
    </article>
  );
}
