function readEnv(name: string, fallback = "") {
  return (process.env[name] ?? fallback).trim();
}

function readEnvAny(names: string[], fallback = "") {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return fallback;
}

function asBool(value: string, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function fail(message: string): never {
  throw new Error(`[plot] ${message}`);
}

const nodeEnv = readEnv("NODE_ENV", "development") || "development";
export const isProd = nodeEnv === "production";

const rawDbBackend = readEnv("DB_BACKEND", "sqlite").toLowerCase();
const dbBackend =
  rawDbBackend === "msql" ? "mysql" : rawDbBackend;
if (dbBackend !== "sqlite" && dbBackend !== "postgres" && dbBackend !== "mysql") {
  fail(`DB_BACKEND must be sqlite, postgres, or mysql (got "${rawDbBackend}").`);
}

const rawStorage = readEnv("STORAGE_BACKEND", "local").toLowerCase();
if (rawStorage !== "local" && rawStorage !== "s3") {
  fail(`STORAGE_BACKEND must be local or s3 (got "${rawStorage}").`);
}

const databaseUrl = readEnvAny(["DATABASE_URL", "POSTGRES_URL", "MYSQL_URL"]);
const sqlitePath = readEnv("SQLITE_PATH", "data/planner.db") || "data/planner.db";

if (dbBackend !== "sqlite" && !databaseUrl) {
  fail(`DATABASE_URL is required when DB_BACKEND=${dbBackend}.`);
}
if (dbBackend === "postgres" && databaseUrl && !/^(postgres|postgresql):/i.test(databaseUrl)) {
  fail("DATABASE_URL must start with postgres:// when DB_BACKEND=postgres.");
}
if (dbBackend === "mysql" && databaseUrl && !/^mysql2?:/i.test(databaseUrl)) {
  fail("DATABASE_URL must start with mysql:// when DB_BACKEND=mysql.");
}

const s3Endpoint = readEnvAny(["S3_ENDPOINT", "AWS_ENDPOINT"]);
const s3Bucket = readEnvAny(["S3_BUCKET", "AWS_BUCKET"]);
const s3AccessKey = readEnvAny([
  "S3_ACCESS_KEY",
  "S3_ACCESS_KEY_ID",
  "AWS_ACCESS_KEY_ID",
]);
const s3SecretKey = readEnvAny([
  "S3_SECRET_KEY",
  "S3_SECRET_ACCESS_KEY",
  "AWS_SECRET_ACCESS_KEY",
]);

if (rawStorage === "s3") {
  if (!s3Bucket) fail("S3_BUCKET is required when STORAGE_BACKEND=s3.");
  if (!s3AccessKey || !s3SecretKey) {
    fail("S3_ACCESS_KEY and S3_SECRET_KEY are required when STORAGE_BACKEND=s3.");
  }
}

export const config = {
  nodeEnv,
  isProd,
  port: Number(readEnv("PORT", "3001") || 3001),
  appUrl: readEnv("APP_URL", isProd ? "" : "http://127.0.0.1:3001"),
  cookieSecure: asBool(readEnv("COOKIE_SECURE"), isProd),

  dbBackend: dbBackend as "sqlite" | "postgres" | "mysql",
  databaseUrl,
  sqlitePath,

  storageBackend: rawStorage as "local" | "s3",
  uploadDir: readEnv("UPLOAD_DIR", "data/uploads") || "data/uploads",

  s3: {
    endpoint: s3Endpoint,
    region: readEnvAny(["S3_REGION", "AWS_REGION"], "us-east-1") || "us-east-1",
    bucket: s3Bucket,
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey,
    sessionToken: readEnvAny(["S3_SESSION_TOKEN", "AWS_SESSION_TOKEN"]),
    forcePathStyle: asBool(readEnv("S3_FORCE_PATH_STYLE"), Boolean(s3Endpoint)),
    publicUrl: readEnv("S3_PUBLIC_URL").replace(/\/+$/, ""),
    prefix: (readEnv("S3_PREFIX", "uploads") || "uploads").replace(/^\/+|\/+$/g, ""),
  },
} as const;

export type AppConfig = typeof config;
export type DbBackend = typeof config.dbBackend;
export type StorageBackend = typeof config.storageBackend;
