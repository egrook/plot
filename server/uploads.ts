import { randomBytes } from "node:crypto";
import { config } from "./config";

export const UPLOAD_DIR = config.uploadDir;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const BLOCKED_EXTS = new Set([
  "html",
  "htm",
  "xhtml",
  "svg",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "php",
  "exe",
  "bat",
  "cmd",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "dll",
  "so",
  "app",
  "scr",
  "vbs",
  "jar",
]);

const INLINE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "csv"]);

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  gz: "application/gzip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function extForMime(mime: string) {
  return MIME_TO_EXT[mime] ?? null;
}

export function newUploadId(ext: string) {
  return `${randomBytes(24).toString("base64url")}.${ext}`;
}

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function isSafeUploadId(id: string) {
  return /^[A-Za-z0-9_-]{16,64}\.[a-z0-9]{1,8}$/.test(id);
}

const AVATAR_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

/** Local uploaded file path only — no third-party http(s) URLs. */
export function isLocalFileUrl(value: string) {
  if (!value.startsWith("/api/files/")) return false;
  return isSafeUploadId(value.slice("/api/files/".length));
}

export function isAvatarUrl(value: string) {
  if (!value) return true;
  return isLocalFileUrl(value) && AVATAR_EXTS.has(extFromFilename(value));
}

export function safeAvatarUrl(value: string | null | undefined) {
  const url = value ?? "";
  return isAvatarUrl(url) ? url : "";
}

export function extFromFilename(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return "bin";
  return ext;
}

export function isBlockedExt(ext: string) {
  return BLOCKED_EXTS.has(ext);
}

export function mimeForExt(ext: string, fallback = "application/octet-stream") {
  return EXT_TO_MIME[ext] ?? fallback;
}

export function shouldInlineExt(ext: string) {
  return INLINE_EXTS.has(ext);
}
