CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar TEXT,
  bio TEXT,
  is_civ INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  admin_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration for existing databases (will fail silently if columns exist)
-- Run these manually if needed:
-- ALTER TABLE people ADD COLUMN is_admin INTEGER DEFAULT 0;
-- ALTER TABLE people ADD COLUMN admin_code TEXT;

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

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ideas_sender ON ideas(sender_id);
CREATE INDEX IF NOT EXISTS idx_ideas_created ON ideas(created_at DESC);

CREATE TABLE IF NOT EXISTS idea_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote INTEGER NOT NULL, -- 1 for upvote, -1 for downvote
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE(idea_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_idea_votes_idea ON idea_votes(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_votes_user ON idea_votes(user_id);
