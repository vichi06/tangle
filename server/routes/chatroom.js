import express from 'express';
import db from '../database.js';

const router = express.Router();

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

// Get all ideas with sender info and vote counts
router.get('/', (req, res) => {
  const userId = req.query.userId;
  try {
    const ideas = db.prepare(`
      SELECT
        i.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar,
        COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
        COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
      FROM ideas i
      JOIN people p ON i.sender_id = p.id
      LEFT JOIN idea_votes v ON i.id = v.idea_id
      GROUP BY i.id
      ORDER BY i.created_at ASC
    `).all();

    // If userId provided, get user's votes
    if (userId) {
      const userVotes = db.prepare(`
        SELECT idea_id, vote FROM idea_votes WHERE user_id = ?
      `).all(userId);
      const voteMap = Object.fromEntries(userVotes.map(v => [v.idea_id, v.vote]));
      ideas.forEach(idea => {
        idea.userVote = voteMap[idea.id] || 0;
      });
    }

    res.json(ideas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check cooldown status for a user
router.get('/cooldown/:userId', (req, res) => {
  try {
    const lastIdea = db.prepare(`
      SELECT created_at FROM ideas
      WHERE sender_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.params.userId);

    if (!lastIdea) {
      return res.json({ canSend: true, remainingMs: 0 });
    }

    const lastTime = new Date(lastIdea.created_at + 'Z').getTime();
    const now = Date.now();
    const elapsed = now - lastTime;
    const remaining = Math.max(0, COOLDOWN_MS - elapsed);

    res.json({
      canSend: remaining === 0,
      remainingMs: remaining
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get count of new ideas since a timestamp (for notification badge)
// Excludes ideas created by the requesting user
router.get('/new-count/:userId', (req, res) => {
  const { userId } = req.params;
  const { since } = req.query;

  try {
    let query;
    let params;

    if (since) {
      // Count ideas created after the given timestamp, excluding user's own ideas
      query = `
        SELECT COUNT(*) as count FROM ideas
        WHERE created_at > ? AND sender_id != ?
      `;
      params = [since, userId];
    } else {
      // If no timestamp provided, return total count excluding user's own ideas
      query = `
        SELECT COUNT(*) as count FROM ideas
        WHERE sender_id != ?
      `;
      params = [userId];
    }

    const result = db.prepare(query).get(...params);
    res.json({ count: result.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit new message
router.post('/', (req, res) => {
  const { sender_id, content, mentioned_ids } = req.body;

  // Validation
  if (!sender_id) {
    return res.status(400).json({ error: 'Sender ID is required' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  if (content.length > 500) {
    return res.status(400).json({ error: 'Message too long (max 500 characters)' });
  }

  try {
    // Verify sender exists
    const sender = db.prepare('SELECT id FROM people WHERE id = ?').get(sender_id);
    if (!sender) {
      return res.status(400).json({ error: 'Sender not found' });
    }

    // Check cooldown
    const lastIdea = db.prepare(`
      SELECT created_at FROM ideas
      WHERE sender_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sender_id);

    if (lastIdea) {
      const lastTime = new Date(lastIdea.created_at + 'Z').getTime();
      const now = Date.now();
      const elapsed = now - lastTime;

      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        return res.status(429).json({
          error: `Please wait ${remaining} minutes before sending another message`,
          remainingMs: COOLDOWN_MS - elapsed
        });
      }
    }

    // Insert new message
    const stmt = db.prepare('INSERT INTO ideas (sender_id, content) VALUES (?, ?)');
    const result = stmt.run(sender_id, content.trim());
    const messageId = result.lastInsertRowid;

    // Insert mentions if any (exclude self-mentions)
    if (mentioned_ids && Array.isArray(mentioned_ids) && mentioned_ids.length > 0) {
      const mentionStmt = db.prepare(
        'INSERT OR IGNORE INTO message_mentions (message_id, mentioned_user_id) VALUES (?, ?)'
      );
      for (const userId of mentioned_ids) {
        if (userId !== sender_id) {
          mentionStmt.run(messageId, userId);
        }
      }
    }

    // Return with sender info
    const message = db.prepare(`
      SELECT
        i.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar
      FROM ideas i
      JOIN people p ON i.sender_id = p.id
      WHERE i.id = ?
    `).get(messageId);

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get count of unseen mentions for a user
router.get('/mentions/count/:userId', (req, res) => {
  const { userId } = req.params;

  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM message_mentions
      WHERE mentioned_user_id = ? AND seen = 0
    `).get(userId);

    res.json({ count: result.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all mentions as seen for a user
router.post('/mentions/mark-seen/:userId', (req, res) => {
  const { userId } = req.params;

  try {
    db.prepare(`
      UPDATE message_mentions SET seen = 1
      WHERE mentioned_user_id = ? AND seen = 0
    `).run(userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vote on an idea
router.post('/:ideaId/vote', (req, res) => {
  const { ideaId } = req.params;
  const { user_id, vote } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (vote !== 1 && vote !== -1 && vote !== 0) {
    return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
  }

  try {
    // Verify idea exists
    const idea = db.prepare('SELECT id FROM ideas WHERE id = ?').get(ideaId);
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    // Verify user exists
    const user = db.prepare('SELECT id FROM people WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (vote === 0) {
      // Remove vote
      db.prepare('DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?').run(ideaId, user_id);
    } else {
      // Upsert vote
      db.prepare(`
        INSERT INTO idea_votes (idea_id, user_id, vote)
        VALUES (?, ?, ?)
        ON CONFLICT(idea_id, user_id) DO UPDATE SET vote = excluded.vote
      `).run(ideaId, user_id, vote);
    }

    // Return updated vote counts
    const counts = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
        COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
      FROM idea_votes
      WHERE idea_id = ?
    `).get(ideaId);

    res.json({
      idea_id: parseInt(ideaId),
      upvotes: counts.upvotes,
      downvotes: counts.downvotes,
      userVote: vote
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
