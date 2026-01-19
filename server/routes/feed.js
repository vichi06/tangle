import express from 'express';
import db from '../database.js';

const router = express.Router();

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

// Check cooldown status for a user (must be before /:relationshipId to match first)
router.get('/cooldown/:userId', (req, res) => {
  try {
    const lastComment = db.prepare(`
      SELECT created_at FROM feed_comments
      WHERE sender_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.params.userId);

    if (!lastComment) {
      return res.json({ canSend: true, remainingMs: 0 });
    }

    const lastTime = new Date(lastComment.created_at + 'Z').getTime();
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

// Get comments for a relationship with sender info and vote counts
router.get('/:relationshipId', (req, res) => {
  const { relationshipId } = req.params;
  const userId = req.query.userId;

  try {
    const comments = db.prepare(`
      SELECT
        c.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar,
        COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
        COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
      FROM feed_comments c
      JOIN people p ON c.sender_id = p.id
      LEFT JOIN feed_comment_votes v ON c.id = v.comment_id
      WHERE c.relationship_id = ?
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `).all(relationshipId);

    // If userId provided, get user's votes
    if (userId) {
      const userVotes = db.prepare(`
        SELECT comment_id, vote FROM feed_comment_votes WHERE user_id = ?
      `).all(userId);
      const voteMap = Object.fromEntries(userVotes.map(v => [v.comment_id, v.vote]));
      comments.forEach(comment => {
        comment.userVote = voteMap[comment.id] || 0;
      });
    }

    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit new comment
router.post('/:relationshipId', (req, res) => {
  const { relationshipId } = req.params;
  const { sender_id, content, image, mentioned_ids } = req.body;

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

    // Verify relationship exists
    const relationship = db.prepare('SELECT id FROM relationships WHERE id = ?').get(relationshipId);
    if (!relationship) {
      return res.status(400).json({ error: 'Relationship not found' });
    }

    // Check cooldown
    const lastComment = db.prepare(`
      SELECT created_at FROM feed_comments
      WHERE sender_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sender_id);

    if (lastComment) {
      const lastTime = new Date(lastComment.created_at + 'Z').getTime();
      const now = Date.now();
      const elapsed = now - lastTime;

      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        return res.status(429).json({
          error: `Please wait ${remaining} minutes before sending another comment`,
          remainingMs: COOLDOWN_MS - elapsed
        });
      }
    }

    // Insert new comment
    const stmt = db.prepare(
      'INSERT INTO feed_comments (relationship_id, sender_id, content, image) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(relationshipId, sender_id, content.trim(), image || null);
    const commentId = result.lastInsertRowid;

    // Insert mentions if any (exclude self-mentions)
    if (mentioned_ids && Array.isArray(mentioned_ids) && mentioned_ids.length > 0) {
      const mentionStmt = db.prepare(
        'INSERT OR IGNORE INTO feed_comment_mentions (comment_id, mentioned_user_id) VALUES (?, ?)'
      );
      for (const userId of mentioned_ids) {
        if (userId !== sender_id) {
          mentionStmt.run(commentId, userId);
        }
      }
    }

    // Return with sender info
    const comment = db.prepare(`
      SELECT
        c.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar
      FROM feed_comments c
      JOIN people p ON c.sender_id = p.id
      WHERE c.id = ?
    `).get(commentId);

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vote on a comment
router.post('/:relationshipId/:commentId/vote', (req, res) => {
  const { commentId } = req.params;
  const { user_id, vote } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (vote !== 1 && vote !== -1 && vote !== 0) {
    return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
  }

  try {
    // Verify comment exists
    const comment = db.prepare('SELECT id FROM feed_comments WHERE id = ?').get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Verify user exists
    const user = db.prepare('SELECT id FROM people WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (vote === 0) {
      // Remove vote
      db.prepare('DELETE FROM feed_comment_votes WHERE comment_id = ? AND user_id = ?').run(commentId, user_id);
    } else {
      // Upsert vote
      db.prepare(`
        INSERT INTO feed_comment_votes (comment_id, user_id, vote)
        VALUES (?, ?, ?)
        ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = excluded.vote
      `).run(commentId, user_id, vote);
    }

    // Return updated vote counts
    const counts = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
        COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
      FROM feed_comment_votes
      WHERE comment_id = ?
    `).get(commentId);

    res.json({
      comment_id: parseInt(commentId),
      upvotes: counts.upvotes,
      downvotes: counts.downvotes,
      userVote: vote
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
