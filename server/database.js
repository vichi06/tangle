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
  { table: 'people', column: 'is_system', sql: 'ALTER TABLE people ADD COLUMN is_system INTEGER DEFAULT 0' },
  { table: 'relationships', column: 'is_pending', sql: 'ALTER TABLE relationships ADD COLUMN is_pending INTEGER DEFAULT 0' },
  { table: 'relationships', column: 'pending_by', sql: 'ALTER TABLE relationships ADD COLUMN pending_by INTEGER REFERENCES people(id) ON DELETE SET NULL' },
  { table: 'relationships', column: 'group_id', sql: 'ALTER TABLE relationships ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE' },
  { table: 'people', column: 'group_id', sql: 'ALTER TABLE people ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE' },
  { table: 'messages', column: 'group_id', sql: 'ALTER TABLE messages ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL' },
];

for (const { table, column, sql } of migrations) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(sql);
  }
}

// Create index on people.group_id (after migration adds the column)
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_people_group ON people(group_id)');
} catch {}

// Ensure TanTan system bot user exists
const botUser = db.prepare('SELECT id FROM people WHERE is_system = 1').get();
if (!botUser) {
  db.prepare('INSERT INTO people (first_name, last_name, is_system) VALUES (?, ?, 1)').run('TanTan', 'Bot');
}

// Ensure default CIV group exists and assign ungrouped people
const existingGroup = db.prepare('SELECT id FROM groups WHERE code = ?').get('civ-tangle-01');
if (!existingGroup) {
  const firstAdmin = db.prepare('SELECT id FROM people WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
  db.prepare('INSERT OR IGNORE INTO groups (name, code, created_by) VALUES (?, ?, ?)').run(
    'CIV Tangle',
    'civ-tangle-01',
    firstAdmin ? firstAdmin.id : null
  );
}
const civGroup = db.prepare('SELECT id FROM groups WHERE code = ?').get('civ-tangle-01');
if (civGroup) {
  db.prepare('UPDATE people SET group_id = ? WHERE group_id IS NULL').run(civGroup.id);
}

export default db;
