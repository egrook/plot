import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

type Props = {
  readOnly?: boolean;
};

export function NodeHandles({ readOnly }: Props) {
  const className = cn("handle", readOnly && "handle-readonly");
  return (
    <>
      <Handle
        className={className}
        type="target"
        id="left"
        position={Position.Left}
        isConnectable={!readOnly}
      />
      <Handle
        className={className}
        type="source"
        id="right"
        position={Position.Right}
        isConnectable={!readOnly}
      />
      <Handle
        className={className}
        type="target"
        id="top"
        position={Position.Top}
        isConnectable={!readOnly}
      />
      <Handle
        className={className}
        type="source"
        id="bottom"
        position={Position.Bottom}
        isConnectable={!readOnly}
      />
    </>
  );
}
