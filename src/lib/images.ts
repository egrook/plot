import { api } from "@/api";

export function isImageUrl(text: string) {
  const value = text.trim();
  if (!value) return false;
  if (value.startsWith("/api/files/")) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

export function clipboardImages(data: DataTransfer | null) {
  if (!data) return [];
  return Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export async function uploadFilesToMarkdown(files: File[]) {
  const blocks: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const uploaded = await api.uploadImage(file);
    blocks.push(`![${uploaded.name}](${uploaded.url})`);
  }
  return blocks.join("\n\n");
}
