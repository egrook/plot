import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpaceNodeData } from "@/types";

export type ImageFlowNode = Node<SpaceNodeData, "image">;

export default function ImageNode({ data, selected }: NodeProps<ImageFlowNode>) {
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
        minWidth={200}
        minHeight={160}
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
            Image
          </Badge>
          <h3 className="mt-1 truncate text-base leading-tight">
            {data.title || "Image"}
          </h3>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="nodrag nopan"
          onClick={data.onOpen}
        >
          <ImageIcon />
        </Button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden" onDoubleClick={data.onOpen}>
        {data.content ? (
          <img
            className="bg-background size-full object-contain"
            src={data.content}
            alt={data.title || ""}
            draggable={false}
            onClick={(event) => {
              event.preventDefault();
              data.onOpen();
            }}
          />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm">
            <ImageIcon className="size-5 opacity-60" />
            {data.readOnly ? "No image." : "Paste an image or add a URL."}
          </div>
        )}
      </div>
    </article>
  );
}
