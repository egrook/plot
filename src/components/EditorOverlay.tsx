import { lazy, Suspense } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-markdown-preview/markdown.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { SpaceNode } from "@/types";
import MarkdownEditor from "./MarkdownEditor";

const ExcalidrawEditor = lazy(() => import("./ExcalidrawEditor"));

type Props = {
  node: SpaceNode;
  saving: boolean;
  readOnly?: boolean;
  onTitle: (title: string) => void;
  onMarkdown: (content: string) => void;
  onDrawing: (content: string, preview: string | null) => void;
  onClose: () => void;
  onDelete: () => void;
};

export default function EditorOverlay({
  node,
  saving,
  readOnly = false,
  onTitle,
  onMarkdown,
  onDrawing,
  onClose,
  onDelete,
}: Props) {
  return (
    <div className="bg-background fixed inset-0 z-[80] grid grid-rows-[56px_1fr]">
      <header className="bg-background relative z-20 flex items-center gap-3 border-b px-4">
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
      </header>
      <div className="editor-stage min-h-0">
        {node.type === "markdown" ? (
          readOnly ? (
            <div className="md-preview h-full overflow-auto px-6 py-5" data-color-mode="dark">
              {node.content ? (
                <MDEditor.Markdown source={node.content} />
              ) : (
                <p className="text-muted-foreground">This note is empty.</p>
              )}
            </div>
          ) : (
            <MarkdownEditor value={node.content} onChange={onMarkdown} />
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
