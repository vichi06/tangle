CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar TEXT,
  bio TEXT,
  is_external INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  admin_code TEXT,
  is_pending INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration for existing databases:
-- 1. Add is_external column: ALTER TABLE people ADD COLUMN is_external INTEGER DEFAULT 0;
-- 2. Migrate data: UPDATE people SET is_external = (1 - COALESCE(is_civ, 0));
-- 3. Optionally remove is_civ: (keep for backwards compatibility or remove later)

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

CREATE TABLE IF NOT EXISTS message_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  mentioned_user_id INTEGER NOT NULL,
  seen INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES ideas(id) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_user_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE(message_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_mentions_user ON message_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_message ON message_mentions(message_id);

-- Feed comments for relationship edges
CREATE TABLE IF NOT EXISTS feed_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_comments_relationship ON feed_comments(relationship_id);
CREATE INDEX IF NOT EXISTS idx_feed_comments_sender ON feed_comments(sender_id);
CREATE INDEX IF NOT EXISTS idx_feed_comments_created ON feed_comments(created_at DESC);

-- Votes for feed comments
CREATE TABLE IF NOT EXISTS feed_comment_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES feed_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_comment_votes_comment ON feed_comment_votes(comment_id);
CREATE INDEX IF NOT EXISTS idx_feed_comment_votes_user ON feed_comment_votes(user_id);

-- Mentions in feed comments
CREATE TABLE IF NOT EXISTS feed_comment_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  mentioned_user_id INTEGER NOT NULL,
  seen INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES feed_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_user_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE(comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_comment_mentions_user ON feed_comment_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_feed_comment_mentions_comment ON feed_comment_mentions(comment_id);
