/**
 * SQLite connection using sql.js (pure JS, no native dependencies).
 * sql.js loads the WASM binary and provides synchronous query execution.
 */
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.resolve(__dirname, "../../data/payroll.db");

let _db: SqlJsDatabase | null = null;
let _initPromise: Promise<SqlJsDatabase> | null = null;

/**
 * Initialize and return the database. Call once at startup.
 * Subsequent calls return the cached instance.
 */
export async function initDb(): Promise<SqlJsDatabase> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const SQL = await initSqlJs();

    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load existing DB or create new
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      _db = new SQL.Database(buffer);
    } else {
      _db = new SQL.Database();
    }

    _db.run("PRAGMA foreign_keys = ON");
    return _db;
  })();

  return _initPromise;
}

/**
 * Get the database instance (must call initDb first).
 */
export function getDb(): SqlJsDatabase {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}

/**
 * Persist the in-memory database to disk.
 */
export function saveDb(): void {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Helper: run a query and return all rows as objects.
 */
export function queryAll<T = Record<string, any>>(sql: string, params: any[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

/**
 * Helper: run a query and return the first row as an object, or undefined.
 */
export function queryOne<T = Record<string, any>>(sql: string, params: any[] = []): T | undefined {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row: T | undefined;
  if (stmt.step()) {
    row = stmt.getAsObject() as T;
  }
  stmt.free();
  return row;
}

/**
 * Helper: run a statement (INSERT/UPDATE/DELETE).
 */
export function runSql(sql: string, params: any[] = []): void {
  const db = getDb();
  db.run(sql, params);
  saveDb(); // auto-persist after writes
}
