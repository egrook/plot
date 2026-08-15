import { useEffect, useRef } from "react";
import MDEditor, { commands, type ICommand } from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { markdownPreviewOptions } from "@/components/MarkdownBody";
import { pickFiles, uploadFilesToNoteMarkdown } from "@/lib/files";
import { clipboardImages, uploadFilesToMarkdown } from "@/lib/images";
import { toastFromError } from "@/lib/toast";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onWikiLink?: (title: string) => void;
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

export default function MarkdownEditor({ value, onChange, onWikiLink }: Props) {
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

  async function insertFiles(files: File[], start: number, end: number) {
    if (files.length === 0) return;
    const token = `uploading-${crypto.randomUUID()}`;
    const placeholder = `[Uploading…](${token})`;
    onChange(insertAt(valueRef.current, start, end, placeholder));
    try {
      const markdown = await uploadFilesToNoteMarkdown(files);
      onChange(
        valueRef.current.replace(
          placeholder,
          markdown || "<!-- upload failed -->",
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      onChange(valueRef.current.replace(placeholder, `<!-- ${message} -->`));
      toastFromError(err, "Could not upload that file.");
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

  const fileCommand: ICommand = {
    name: "file",
    keyCommand: "file",
    buttonProps: { "aria-label": "Upload file", title: "Upload file" },
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path
          d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    execute: (_state, commandApi) => {
      void pickFiles().then(async (files) => {
        const docs = files.filter((file) => !file.type.startsWith("image/"));
        if (docs.length === 0) return;
        try {
          const markdown = await uploadFilesToNoteMarkdown(docs);
          if (markdown) commandApi.replaceSelection(markdown);
        } catch (err) {
          commandApi.replaceSelection("<!-- Upload failed -->");
          toastFromError(err, "Could not upload that file.");
        }
      });
    },
  };

  const wikiCommand: ICommand = {
    name: "wiki",
    keyCommand: "wiki",
    buttonProps: { "aria-label": "Wiki link", title: "Wiki link [[note]]" },
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <text x="2" y="16" fontSize="12" fontFamily="ui-sans-serif, system-ui">
          [[
        </text>
      </svg>
    ),
    execute: (state, commandApi) => {
      const selected = state.selectedText || "note";
      commandApi.replaceSelection(`[[${selected}]]`);
    },
  };

  const editorCommands = [
    ...commands.getCommands().map((command) =>
      command.name === "image" ? imageCommand : command,
    ),
    fileCommand,
    wikiCommand,
  ];

  return (
    <div
      ref={wrapRef}
      className="md-wrap"
      data-color-mode="dark"
      onPaste={(event) => {
        const images = clipboardImages(event.clipboardData);
        const docs = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => !file.type.startsWith("image/"),
        );
        if (images.length === 0 && docs.length === 0) return;
        event.preventDefault();
        const target = event.target as HTMLTextAreaElement;
        const start =
          typeof target.selectionStart === "number"
            ? target.selectionStart
            : valueRef.current.length;
        const end =
          typeof target.selectionEnd === "number" ? target.selectionEnd : start;
        if (images.length > 0) void insertImages(images, start, end);
        if (docs.length > 0) void insertFiles(docs, start, end);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length === 0) return;
        event.preventDefault();
        const cursor = valueRef.current.length;
        const images = dropped.filter((file) => file.type.startsWith("image/"));
        const docs = dropped.filter((file) => !file.type.startsWith("image/"));
        if (images.length > 0) void insertImages(images, cursor, cursor);
        if (docs.length > 0) void insertFiles(docs, cursor, cursor);
      }}
    >
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? "")}
        preview="live"
        visibleDragbar={false}
        height="100%"
        commands={editorCommands}
        previewOptions={markdownPreviewOptions(onWikiLink)}
        textareaProps={{
          autoFocus: true,
          placeholder:
            "Write here. Use [[other note]] to link a space. Paste, drop, or upload images and files.",
        }}
      />
    </div>
  );
}
