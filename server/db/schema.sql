CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar TEXT,
  bio TEXT,
  is_civ INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person1_id INTEGER NOT NULL,
  person2_id INTEGER NOT NULL,
  intensity TEXT DEFAULT 'kiss',
  date TEXT,
  context TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person1_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (person2_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE(person1_id, person2_id)
);

CREATE INDEX IF NOT EXISTS idx_rel_person1 ON relationships(person1_id);
CREATE INDEX IF NOT EXISTS idx_rel_person2 ON relationships(person2_id);
