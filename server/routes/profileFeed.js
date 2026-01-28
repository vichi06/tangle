import express from 'express';
import db from '../database.js';

const router = express.Router();

// Get comments for a profile with sender info and vote counts
router.get('/:profileId', (req, res) => {
  const { profileId } = req.params;
  const userId = req.query.userId;

  try {
    // Verify profile exists and get profile info
    const profile = db.prepare(`
      SELECT id, first_name, last_name, avatar, bio, is_external
      FROM people WHERE id = ?
    `).get(profileId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const comments = db.prepare(`
      SELECT
        c.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar,
        COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
        COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
      FROM profile_comments c
      JOIN people p ON c.sender_id = p.id
      LEFT JOIN profile_comment_votes v ON c.id = v.comment_id
      WHERE c.profile_id = ?
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `).all(profileId);

    // If userId provided, get user's votes
    if (userId) {
      const userVotes = db.prepare(`
        SELECT comment_id, vote FROM profile_comment_votes WHERE user_id = ?
      `).all(userId);
      const voteMap = Object.fromEntries(userVotes.map(v => [v.comment_id, v.vote]));
      comments.forEach(comment => {
        comment.userVote = voteMap[comment.id] || 0;
      });
    }

    // Get relationships for this profile
    const relationships = db.prepare(`
      SELECT
        r.*,
        p1.first_name as person1_first_name,
        p1.last_name as person1_last_name,
        p1.avatar as person1_avatar,
        p2.first_name as person2_first_name,
        p2.last_name as person2_last_name,
        p2.avatar as person2_avatar
      FROM relationships r
      JOIN people p1 ON r.person1_id = p1.id
      JOIN people p2 ON r.person2_id = p2.id
      WHERE r.person1_id = ? OR r.person2_id = ?
    `).all(profileId, profileId);

    res.json({ profile, comments, relationships });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit new comment (no cooldown)
router.post('/:profileId', (req, res) => {
  const { profileId } = req.params;
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

    // Verify profile exists
    const profile = db.prepare('SELECT id FROM people WHERE id = ?').get(profileId);
    if (!profile) {
      return res.status(400).json({ error: 'Profile not found' });
    }

    // Insert new comment
    const stmt = db.prepare(
      'INSERT INTO profile_comments (profile_id, sender_id, content, image) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(profileId, sender_id, content.trim(), image || null);
    const commentId = result.lastInsertRowid;

    // Insert mentions if any (exclude self-mentions)
    if (mentioned_ids && Array.isArray(mentioned_ids) && mentioned_ids.length > 0) {
      const mentionStmt = db.prepare(
        'INSERT OR IGNORE INTO profile_comment_mentions (comment_id, mentioned_user_id) VALUES (?, ?)'
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
      FROM profile_comments c
      JOIN people p ON c.sender_id = p.id
      WHERE c.id = ?
    `).get(commentId);

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vote on a comment
router.post('/:profileId/:commentId/vote', (req, res) => {
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
    const comment = db.prepare('SELECT id FROM profile_comments WHERE id = ?').get(commentId);
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
      db.prepare('DELETE FROM profile_comment_votes WHERE comment_id = ? AND user_id = ?').run(commentId, user_id);
    } else {
      // Upsert vote
      db.prepare(`
        INSERT INTO profile_comment_votes (comment_id, user_id, vote)
        VALUES (?, ?, ?)
        ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = excluded.vote
      `).run(commentId, user_id, vote);
    }

    // Return updated vote counts
    const counts = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
        COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
      FROM profile_comment_votes
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
