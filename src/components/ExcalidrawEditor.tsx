import { useCallback, useEffect, useMemo, useRef } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

type Scene = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

type Props = {
  value: string;
  onChange: (content: string, preview: string | null) => void;
  viewOnly?: boolean;
};

function sceneSignature(scene: Scene) {
  const elements = scene.elements as {
    id?: string;
    version?: number;
    versionNonce?: number;
    isDeleted?: boolean;
  }[];
  const elementKey = elements
    .map(
      (element) =>
        `${element.id ?? ""}:${element.version ?? 0}:${element.versionNonce ?? 0}:${element.isDeleted ? 1 : 0}`,
    )
    .join(",");
  const fileKey = Object.keys(scene.files).sort().join(",");
  return `${String(scene.appState.viewBackgroundColor ?? "")}|${fileKey}|${elementKey}`;
}

function parseScene(raw: string): Scene {
  try {
    const data = JSON.parse(raw);
    const appState =
      data.appState && typeof data.appState === "object" ? { ...data.appState } : {};
    const bg = String(appState.viewBackgroundColor ?? "").toLowerCase();
    if (bg === "#121212" || bg === "#1a1915") {
      appState.viewBackgroundColor = "#ffffff";
    }
    return {
      elements: Array.isArray(data.elements) ? data.elements : [],
      appState,
      files: data.files && typeof data.files === "object" ? data.files : {},
    };
  } catch {
    return { elements: [], appState: {}, files: {} };
  }
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function ExcalidrawEditor({
  value,
  onChange,
  viewOnly = false,
}: Props) {
  const scene = useMemo(() => parseScene(value), [value]);
  const latest = useRef(scene);
  const lastSaved = useRef(sceneSignature(scene));
  const valueRef = useRef(value);
  if (valueRef.current !== value) {
    valueRef.current = value;
    latest.current = scene;
    lastSaved.current = sceneSignature(scene);
  }
  const timer = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const persist = useCallback(async (next: Scene) => {
    const signature = sceneSignature(next);
    if (signature === lastSaved.current) return;
    lastSaved.current = signature;
    const elements = next.elements as { isDeleted?: boolean }[];
    const visible = elements.filter((el) => !el.isDeleted);
    let preview: string | null = null;
    if (visible.length > 0) {
      try {
        const blob = await exportToBlob({
          elements: visible as never,
          appState: {
            exportBackground: true,
            viewBackgroundColor: String(
              next.appState.viewBackgroundColor ?? "#ffffff",
            ),
            exportWithDarkMode: true,
          },
          files: next.files as never,
          mimeType: "image/png",
          maxWidthOrHeight: 720,
          exportPadding: 16,
        });
        preview = await blobToDataUrl(blob);
      } catch {
        preview = null;
      }
    }
    onChangeRef.current(
      JSON.stringify({
        elements: next.elements,
        appState: {
          viewBackgroundColor: next.appState.viewBackgroundColor ?? "#ffffff",
        },
        files: next.files,
      }),
      preview,
    );
  }, []);

  useEffect(() => {
    if (viewOnly) return;
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void persist(latest.current);
    };
  }, [persist, viewOnly]);

  return (
    <div className="excalidraw-host">
      <Excalidraw
        theme="dark"
        viewModeEnabled={viewOnly}
        zenModeEnabled={viewOnly}
        initialData={{
          elements: scene.elements as never,
          appState: scene.appState as never,
          files: scene.files as never,
          scrollToContent: true,
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            toggleTheme: false,
          },
        }}
        onChange={
          viewOnly
            ? undefined
            : (elements, appState, files) => {
                latest.current = {
                  elements: elements as unknown[],
                  appState: {
                    viewBackgroundColor: appState.viewBackgroundColor,
                  },
                  files: files as Record<string, unknown>,
                };
                if (timer.current) window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => {
                  void persist(latest.current);
                }, 900);
              }
        }
      />
    </div>
  );
}
