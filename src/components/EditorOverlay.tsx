import { lazy, Suspense } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { SpacePlanBadges } from "@/components/SpacePlanBadges";
import { SpacePlanFields } from "@/components/SpacePlanFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/LoadingScreen";
import { MarkdownBody } from "@/components/MarkdownBody";
import type { SpaceNode, SpaceStatus } from "@/types";
import MarkdownEditor from "./MarkdownEditor";

const ExcalidrawEditor = lazy(() => import("./ExcalidrawEditor"));

type Props = {
  node: SpaceNode;
  saving: boolean;
  readOnly?: boolean;
  onTitle: (title: string) => void;
  onStatus: (status: SpaceStatus | "") => void;
  onDueOn: (dueOn: string) => void;
  onMarkdown: (content: string) => void;
  onDrawing: (content: string, preview: string | null) => void;
  onClose: () => void;
  onDelete: () => void;
  onWikiLink?: (title: string) => void;
};

export default function EditorOverlay({
  node,
  saving,
  readOnly = false,
  onTitle,
  onStatus,
  onDueOn,
  onMarkdown,
  onDrawing,
  onClose,
  onDelete,
  onWikiLink,
}: Props) {
  return (
    <div className="bg-background fixed inset-0 z-[80] grid grid-rows-[auto_1fr]">
      <header className="bg-background relative z-20 space-y-2 border-b px-4 py-2">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          <ArrowLeft />
          Board
        </Button>
        {readOnly ? (
          <h1 className="min-w-0 flex-1 truncate text-lg font-medium">
            {node.title || (node.type === "markdown" ? "Untitled note" : "Untitled drawing")}
          </h1>
        ) : (
          <Input
            value={node.title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder={node.type === "markdown" ? "Note title" : "Drawing title"}
            className="font-serif h-9 border-0 bg-transparent text-lg shadow-none focus-visible:ring-0"
          />
        )}
        {readOnly ? (
          <Badge variant="secondary">View only</Badge>
        ) : (
          <>
            <Badge variant={saving ? "secondary" : "outline"}>
              {saving ? "Saving…" : "Saved"}
            </Badge>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 />
              Delete
            </Button>
          </>
        )}
      </div>
        {readOnly ? (
          <SpacePlanBadges status={node.status} dueOn={node.dueOn} />
        ) : (
          <SpacePlanFields
            status={node.status}
            dueOn={node.dueOn}
            onStatus={onStatus}
            onDueOn={onDueOn}
          />
        )}
      </header>
      <div className="editor-stage min-h-0">
        {node.type === "markdown" ? (
          readOnly ? (
            node.content ? (
              <MarkdownBody
                source={node.content}
                className="h-full overflow-auto px-6 py-5"
                onWikiLink={onWikiLink}
              />
            ) : (
              <p className="text-muted-foreground px-6 py-5">This note is empty.</p>
            )
          ) : (
            <MarkdownEditor
              key={node.id}
              value={node.content}
              onChange={onMarkdown}
              onWikiLink={onWikiLink}
            />
          )
        ) : (
          <Suspense fallback={<LoadingScreen message="Loading Excalidraw…" />}>
            <ExcalidrawEditor
              value={node.content}
              onChange={onDrawing}
              viewOnly={readOnly}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
