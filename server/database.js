import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'db', 'tangle.db');
const schemaPath = path.join(__dirname, 'db', 'schema.sql');

// Ensure db directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema (creates tables if they don't exist)
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Migrations: add columns that may be missing on older databases
const migrations = [
  { table: 'people', column: 'is_pending', sql: 'ALTER TABLE people ADD COLUMN is_pending INTEGER DEFAULT 0' },
  { table: 'relationships', column: 'is_pending', sql: 'ALTER TABLE relationships ADD COLUMN is_pending INTEGER DEFAULT 0' },
  { table: 'relationships', column: 'pending_by', sql: 'ALTER TABLE relationships ADD COLUMN pending_by INTEGER REFERENCES people(id) ON DELETE SET NULL' },
];

for (const { table, column, sql } of migrations) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(sql);
  }
}

export default db;
