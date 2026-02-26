import db from '../../lib/db.js';

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse route: /api/feed/cooldown/:userId, /api/feed/:relationshipId, /api/feed/:relationshipId/:commentId/vote
  const params = req.query.params
    ? (Array.isArray(req.query.params) ? req.query.params : [req.query.params])
    : req.url.split('?')[0].split('/').filter(Boolean).slice(2);

  try {
    // GET /api/feed/cooldown/:userId
    if (params[0] === 'cooldown' && params[1]) {
      const userId = params[1];

      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const result = await db.execute({
        sql: 'SELECT created_at FROM feed_comments WHERE sender_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [userId]
      });

      if (result.rows.length === 0) {
        return res.json({ canSend: true, remainingMs: 0 });
      }

      const lastTime = new Date(result.rows[0].created_at + 'Z').getTime();
      const now = Date.now();
      const elapsed = now - lastTime;
      const remaining = Math.max(0, COOLDOWN_MS - elapsed);

      return res.json({
        canSend: remaining === 0,
        remainingMs: remaining
      });
    }

    // POST /api/feed/:relationshipId/:commentId/vote
    if (params[2] === 'vote' && params[0] && params[1]) {
      const commentId = params[1];

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { user_id, vote } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      if (vote !== 1 && vote !== -1 && vote !== 0) {
        return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
      }

      // Verify comment exists
      const comment = await db.execute({
        sql: 'SELECT id FROM feed_comments WHERE id = ?',
        args: [commentId]
      });
      if (comment.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      // Verify user exists
      const user = await db.execute({
        sql: 'SELECT id FROM people WHERE id = ?',
        args: [user_id]
      });
      if (user.rows.length === 0) {
        return res.status(400).json({ error: 'User not found' });
      }

      if (vote === 0) {
        // Remove vote
        await db.execute({
          sql: 'DELETE FROM feed_comment_votes WHERE comment_id = ? AND user_id = ?',
          args: [commentId, user_id]
        });
      } else {
        // Upsert vote
        await db.execute({
          sql: `
            INSERT INTO feed_comment_votes (comment_id, user_id, vote)
            VALUES (?, ?, ?)
            ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = excluded.vote
          `,
          args: [commentId, user_id, vote]
        });
      }

      // Return updated vote counts
      const counts = await db.execute({
        sql: `
          SELECT
            COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
            COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
          FROM feed_comment_votes
          WHERE comment_id = ?
        `,
        args: [commentId]
      });

      return res.json({
        comment_id: parseInt(commentId),
        upvotes: counts.rows[0].upvotes,
        downvotes: counts.rows[0].downvotes,
        userVote: vote
      });
    }

    // GET/POST /api/feed/:relationshipId
    if (params[0] && !params[1]) {
      const relationshipId = params[0];

      if (req.method === 'GET') {
        const userId = req.query.userId;
        const result = await db.execute({
          sql: `
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
          `,
          args: [relationshipId]
        });

        let comments = result.rows;

        // If userId provided, get user's votes
        if (userId) {
          const userVotes = await db.execute({
            sql: 'SELECT comment_id, vote FROM feed_comment_votes WHERE user_id = ?',
            args: [userId]
          });
          const voteMap = Object.fromEntries(userVotes.rows.map(v => [v.comment_id, v.vote]));
          comments = comments.map(comment => ({
            ...comment,
            userVote: voteMap[comment.id] || 0
          }));
        }

        return res.json(comments);
      }

      if (req.method === 'POST') {
        const { sender_id, content, image, mentioned_ids } = req.body;

        if (!sender_id) {
          return res.status(400).json({ error: 'Sender ID is required' });
        }

        if (!content || !content.trim()) {
          return res.status(400).json({ error: 'Content is required' });
        }

        if (content.length > 500) {
          return res.status(400).json({ error: 'Message too long (max 500 characters)' });
        }

        // Verify sender exists
        const sender = await db.execute({
          sql: 'SELECT id FROM people WHERE id = ?',
          args: [sender_id]
        });
        if (sender.rows.length === 0) {
          return res.status(400).json({ error: 'Sender not found' });
        }

        // Verify relationship exists
        const relationship = await db.execute({
          sql: 'SELECT id FROM relationships WHERE id = ?',
          args: [relationshipId]
        });
        if (relationship.rows.length === 0) {
          return res.status(400).json({ error: 'Relationship not found' });
        }

        // Check cooldown
        const lastComment = await db.execute({
          sql: 'SELECT created_at FROM feed_comments WHERE sender_id = ? ORDER BY created_at DESC LIMIT 1',
          args: [sender_id]
        });

        if (lastComment.rows.length > 0) {
          const lastTime = new Date(lastComment.rows[0].created_at + 'Z').getTime();
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
        const insert = await db.execute({
          sql: 'INSERT INTO feed_comments (relationship_id, sender_id, content, image) VALUES (?, ?, ?, ?)',
          args: [relationshipId, sender_id, content.trim(), image || null]
        });

        const commentId = insert.lastInsertRowid;

        // Insert mentions if any (exclude self-mentions)
        if (mentioned_ids && Array.isArray(mentioned_ids) && mentioned_ids.length > 0) {
          for (const userId of mentioned_ids) {
            if (userId !== sender_id) {
              await db.execute({
                sql: 'INSERT OR IGNORE INTO feed_comment_mentions (comment_id, mentioned_user_id) VALUES (?, ?)',
                args: [commentId, userId]
              });
            }
          }
        }

        // Return with sender info
        const comment = await db.execute({
          sql: `
            SELECT
              c.*,
              p.first_name as sender_first_name,
              p.last_name as sender_last_name,
              p.avatar as sender_avatar
            FROM feed_comments c
            JOIN people p ON c.sender_id = p.id
            WHERE c.id = ?
          `,
          args: [commentId]
        });

        return res.status(201).json(comment.rows[0]);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
