import express from 'express';
import db from '../database.js';

const router = express.Router();

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

// Get all ideas with sender info, vote counts, and reactions
router.get('/', (req, res) => {
  const userId = req.query.userId;
  try {
    const ideas = db.prepare(`
      SELECT
        i.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar,
        p.is_system as sender_is_system,
        COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
        COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
      FROM ideas i
      JOIN people p ON i.sender_id = p.id
      LEFT JOIN idea_votes v ON i.id = v.idea_id
      GROUP BY i.id
      ORDER BY i.created_at ASC
    `).all();

    // Get all reactions grouped by message
    const allReactions = db.prepare(`
      SELECT message_id, emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
      FROM message_reactions
      GROUP BY message_id, emoji
    `).all();

    // Build reactions map by message_id
    const reactionsMap = {};
    allReactions.forEach(r => {
      if (!reactionsMap[r.message_id]) {
        reactionsMap[r.message_id] = [];
      }
      const userIds = r.user_ids.split(',').map(Number);
      reactionsMap[r.message_id].push({
        emoji: r.emoji,
        count: r.count,
        user_ids: userIds,
        reacted: userId ? userIds.includes(parseInt(userId)) : false
      });
    });

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

    // Add reactions to each idea
    ideas.forEach(idea => {
      idea.reactions = reactionsMap[idea.id] || [];
    });

    res.json(ideas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Consolidated user endpoint: cooldown, new-count, mentions-count
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const { action, since } = req.query;

  if (action === 'cooldown') {
    try {
      const lastIdea = db.prepare(`
        SELECT created_at FROM ideas
        WHERE sender_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(userId);

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
    return;
  }

  if (action === 'new-count') {
    try {
      let query;
      let params;

      if (since) {
        query = `
          SELECT COUNT(*) as count FROM ideas
          WHERE created_at > ? AND sender_id != ?
        `;
        params = [since, userId];
      } else {
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
    return;
  }

  if (action === 'mentions-count') {
    try {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM message_mentions
        WHERE mentioned_user_id = ? AND seen = 0
      `).get(userId);

      res.json({ count: result.count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(400).json({ error: 'Invalid action. Use: cooldown, new-count, mentions-count' });
});

// Consolidated user POST endpoint: mark-seen
router.post('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const { action } = req.body;

  if (action === 'mark-seen') {
    try {
      db.prepare(`
        UPDATE message_mentions SET seen = 1
        WHERE mentioned_user_id = ? AND seen = 0
      `).run(userId);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(400).json({ error: 'Invalid action. Use: mark-seen' });
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

// Consolidated action endpoint: vote + react
router.post('/:messageId/action', (req, res) => {
  const { messageId } = req.params;
  const { action, user_id, vote, emoji } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (action === 'vote') {
    if (vote !== 1 && vote !== -1 && vote !== 0) {
      return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
    }

    try {
      const idea = db.prepare('SELECT id FROM ideas WHERE id = ?').get(messageId);
      if (!idea) {
        return res.status(404).json({ error: 'Idea not found' });
      }

      const user = db.prepare('SELECT id FROM people WHERE id = ?').get(user_id);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      if (vote === 0) {
        db.prepare('DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?').run(messageId, user_id);
      } else {
        db.prepare(`
          INSERT INTO idea_votes (idea_id, user_id, vote)
          VALUES (?, ?, ?)
          ON CONFLICT(idea_id, user_id) DO UPDATE SET vote = excluded.vote
        `).run(messageId, user_id, vote);
      }

      const counts = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
          COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
        FROM idea_votes
        WHERE idea_id = ?
      `).get(messageId);

      return res.json({
        idea_id: parseInt(messageId),
        upvotes: counts.upvotes,
        downvotes: counts.downvotes,
        userVote: vote
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (action === 'react') {
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    try {
      const message = db.prepare('SELECT id FROM ideas WHERE id = ?').get(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const user = db.prepare('SELECT id FROM people WHERE id = ?').get(user_id);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      const existing = db.prepare(
        'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
      ).get(messageId, user_id, emoji);

      if (existing) {
        db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id);
      } else {
        db.prepare(
          'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'
        ).run(messageId, user_id, emoji);
      }

      const reactions = db.prepare(`
        SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
        FROM message_reactions
        WHERE message_id = ?
        GROUP BY emoji
      `).all(messageId);

      return res.json({
        message_id: parseInt(messageId),
        reactions: reactions.map(r => ({
          emoji: r.emoji,
          count: r.count,
          user_ids: r.user_ids.split(',').map(Number),
          reacted: r.user_ids.split(',').map(Number).includes(user_id)
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(400).json({ error: 'Invalid action. Use: vote, react' });
});

export default router;
