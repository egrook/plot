import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { File } from "lucide-react";
import { SpacePlanBadges } from "@/components/SpacePlanBadges";
import { Badge } from "@/components/ui/badge";
import { fileBadge, fileExtFromSpace } from "@/lib/files";
import { cn } from "@/lib/utils";
import type { SpaceNodeData } from "@/types";

export type FileFlowNode = Node<SpaceNodeData, "file">;

export default function FileNode({ data, selected }: NodeProps<FileFlowNode>) {
  const ext = fileExtFromSpace(data.title, data.content, data.preview);

  return (
    <article
      className={cn(
        "bg-card flex h-full w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-2 shadow-lg",
        data.borderColor && "border-2",
        selected && "ring-primary ring-2 ring-offset-2 ring-offset-background",
      )}
      style={data.borderColor ? { borderColor: data.borderColor } : undefined}
      onClick={data.onOpen}
    >
      {data.readOnly ? null : (
        <>
          <Handle className="handle" type="target" id="left" position={Position.Left} />
          <Handle className="handle" type="source" id="right" position={Position.Right} />
          <Handle className="handle" type="target" id="top" position={Position.Top} />
          <Handle className="handle" type="source" id="bottom" position={Position.Bottom} />
        </>
      )}
      <File className="text-muted-foreground size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium leading-tight">
          {data.title || "Untitled file"}
        </h3>
        <SpacePlanBadges status={data.status} dueOn={data.dueOn} className="mt-0.5" />
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        {fileBadge(ext)}
      </Badge>
    </article>
  );
}
