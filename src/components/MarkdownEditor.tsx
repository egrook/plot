import { useEffect, useRef } from "react";
import MDEditor, { commands, type ICommand } from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { clipboardImages, uploadFilesToMarkdown } from "@/lib/images";
import { toastFromError } from "@/lib/toast";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

function insertAt(value: string, start: number, end: number, insert: string) {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const padBefore = before && !before.endsWith("\n") ? "\n\n" : "";
  const padAfter = after && !after.startsWith("\n") ? "\n\n" : "";
  return `${before}${padBefore}${insert}${padAfter}${after}`;
}

function pickImageFiles() {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export default function MarkdownEditor({ value, onChange }: Props) {
  const valueRef = useRef(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  valueRef.current = value;

  useEffect(() => {
    function focusWriter() {
      const textarea = wrapRef.current?.querySelector<HTMLTextAreaElement>(
        "textarea.w-md-editor-text-input",
      );
      if (!textarea) return false;
      textarea.focus({ preventScroll: true });
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      return true;
    }
    if (focusWriter()) return;
    const id = window.setTimeout(focusWriter, 40);
    return () => window.clearTimeout(id);
  }, []);

  async function insertImages(files: File[], start: number, end: number) {
    if (files.length === 0) return;
    const token = `uploading-${crypto.randomUUID()}`;
    const placeholder = `![Uploading…](${token})`;
    onChange(insertAt(valueRef.current, start, end, placeholder));
    try {
      const markdown = await uploadFilesToMarkdown(files);
      onChange(
        valueRef.current.replace(
          placeholder,
          markdown || "<!-- upload failed -->",
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      onChange(valueRef.current.replace(placeholder, `<!-- ${message} -->`));
      toastFromError(err, "Could not upload that image.");
    }
  }

  const imageCommand: ICommand = {
    ...commands.image,
    execute: (_state, commandApi) => {
      void pickImageFiles().then(async (files) => {
        if (files.length === 0) return;
        try {
          const markdown = await uploadFilesToMarkdown(files);
          if (markdown) commandApi.replaceSelection(markdown);
        } catch (err) {
          commandApi.replaceSelection("<!-- Upload failed -->");
          toastFromError(err, "Could not upload that image.");
        }
      });
    },
  };

  const editorCommands = commands.getCommands().map((command) =>
    command.name === "image" ? imageCommand : command,
  );

  return (
    <div
      ref={wrapRef}
      className="md-wrap"
      data-color-mode="dark"
      onPaste={(event) => {
        const files = clipboardImages(event.clipboardData);
        if (files.length === 0) return;
        event.preventDefault();
        const target = event.target as HTMLTextAreaElement;
        const start =
          typeof target.selectionStart === "number"
            ? target.selectionStart
            : valueRef.current.length;
        const end =
          typeof target.selectionEnd === "number" ? target.selectionEnd : start;
        void insertImages(files, start, end);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (files.length === 0) return;
        event.preventDefault();
        const cursor = valueRef.current.length;
        void insertImages(files, cursor, cursor);
      }}
    >
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? "")}
        preview="live"
        visibleDragbar={false}
        height="100%"
        commands={editorCommands}
        textareaProps={{
          autoFocus: true,
          placeholder: "Write here. Paste, drop, or upload images.",
        }}
      />
    </div>
  );
}
