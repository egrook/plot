import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { S3Client } from "bun";
import { config } from "./config";
import { isSafeUploadId } from "./uploads";

let s3: S3Client | null = null;

function objectKey(id: string) {
  return config.s3.prefix ? `${config.s3.prefix}/${id}` : id;
}

function localPath(id: string) {
  if (!isSafeUploadId(id)) throw new Error("Invalid file path");
  return path.join(config.uploadDir, id);
}

export function initStorage() {
  if (config.storageBackend === "local") {
    mkdirSync(config.uploadDir, { recursive: true });
    return;
  }

  s3 = new S3Client({
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
    bucket: config.s3.bucket,
    region: config.s3.region,
    endpoint: config.s3.endpoint || undefined,
    sessionToken: config.s3.sessionToken || undefined,
    virtualHostedStyle: !config.s3.forcePathStyle,
  });
}

function requireS3() {
  if (!s3) throw new Error("[plot] S3 storage is not initialized.");
  return s3;
}

export async function deleteUpload(id: string) {
  if (!isSafeUploadId(id)) return;
  if (config.storageBackend === "local") {
    try {
      await unlink(localPath(id));
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err ? err.code : "";
      if (code !== "ENOENT") throw err;
    }
    return;
  }
  try {
    await requireS3().file(objectKey(id)).delete();
  } catch {
    // object already gone
  }
}

export async function putUpload(id: string, bytes: Uint8Array, mime: string) {
  if (config.storageBackend === "local") {
    mkdirSync(config.uploadDir, { recursive: true });
    await Bun.write(localPath(id), bytes);
    return;
  }
  await requireS3().write(objectKey(id), bytes, { type: mime });
}

export type OpenedUpload =
  | { kind: "file"; file: Blob }
  | { kind: "redirect"; url: string };

export async function openUpload(id: string): Promise<OpenedUpload | null> {
  if (config.storageBackend === "local") {
    const file = Bun.file(localPath(id));
    if (!(await file.exists())) return null;
    return { kind: "file", file };
  }

  const key = objectKey(id);
  if (config.s3.publicUrl) {
    return { kind: "redirect", url: `${config.s3.publicUrl}/${key}` };
  }

  const file = requireS3().file(key);
  if (!(await file.exists())) return null;
  return { kind: "file", file };
}
