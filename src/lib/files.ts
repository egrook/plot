export function fileExtFromSpace(
  title: string,
  content: string,
  preview?: string | null,
) {
  const fromPreview = (preview || "").trim().toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(fromPreview)) return fromPreview;
  const fromTitle = title.split(".").pop()?.toLowerCase() ?? "";
  if (title.includes(".") && /^[a-z0-9]{1,8}$/.test(fromTitle)) return fromTitle;
  const fromUrl = content.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "";
  if (/^[a-z0-9]{1,8}$/.test(fromUrl)) return fromUrl;
  return "file";
}

export function fileBadge(ext: string) {
  return ext.toUpperCase().slice(0, 6);
}

export function openFileUrl(url: string) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function pickFiles() {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export function nonImageFiles(list: File[]) {
  return list.filter((file) => !file.type.startsWith("image/"));
}