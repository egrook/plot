import { Database } from "bun:sqlite";
import { SQL } from "bun";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config, type DbBackend } from "./config";

export type ExecResult = { changes: number };

type SqlClient = {
  backend: DbBackend;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<ExecResult>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
};

let sqlite: Database | null = null;
let remote: SQL | null = null;
let client: SqlClient | null = null;

function toPositional(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function asRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  return [...result] as T[];
}

function createSqliteClient(db: Database): SqlClient {
  const prepared = new Map<string, ReturnType<Database["prepare"]>>();
  const stmt = (sql: string) => {
    let cached = prepared.get(sql);
    if (!cached) {
      cached = db.prepare(sql);
      prepared.set(sql, cached);
    }
    return cached;
  };

  return {
    backend: "sqlite",
    async get<T>(sql: string, params: unknown[] = []) {
      return stmt(sql).get(...params) as T | undefined;
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return stmt(sql).all(...params) as T[];
    },
    async run(sql: string, params: unknown[] = []) {
      const result = stmt(sql).run(...params);
      return { changes: Number(result.changes ?? 0) };
    },
    async exec(sql: string) {
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}

function createRemoteClient(sql: SQL, backend: Exclude<DbBackend, "sqlite">): SqlClient {
  const query = async (text: string, params: unknown[] = []) => {
    return sql.unsafe(toPositional(text), params);
  };

  return {
    backend,
    async get<T>(text: string, params: unknown[] = []) {
      const rows = asRows<T>(await query(text, params));
      return rows[0];
    },
    async all<T>(text: string, params: unknown[] = []) {
      return asRows<T>(await query(text, params));
    },
    async run(text: string, params: unknown[] = []) {
      const result = await query(text, params);
      return {
        changes: Number(
          (result as { affectedRows?: number | null; count?: number | null })
            .affectedRows ??
            (result as { count?: number | null }).count ??
            0,
        ),
      };
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    async close() {
      await sql.close({ timeout: 5 });
    },
  };
}

export async function initSql() {
  if (client) return client;

  if (config.dbBackend === "sqlite") {
    const dir = path.dirname(config.sqlitePath);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    sqlite = new Database(config.sqlitePath, { create: true });
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    sqlite.exec("PRAGMA busy_timeout = 5000;");
    client = createSqliteClient(sqlite);
    return client;
  }

  remote = new SQL(config.databaseUrl, {
    adapter: config.dbBackend,
    max: 10,
    connectionTimeout: 15,
  });
  await remote.unsafe("SELECT 1");
  client = createRemoteClient(remote, config.dbBackend);
  return client;
}

export function sql(): SqlClient {
  if (!client) {
    throw new Error("[plot] Database is not initialized. Call initDb() first.");
  }
  return client;
}

export function prepare(text: string) {
  return {
    get<T>(...params: unknown[]) {
      return sql().get<T>(text, params);
    },
    all<T>(...params: unknown[]) {
      return sql().all<T>(text, params);
    },
    run(...params: unknown[]) {
      return sql().run(text, params);
    },
  };
}

export async function closeSql() {
  if (client) await client.close();
  client = null;
  sqlite = null;
  remote = null;
}
