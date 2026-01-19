import db from '../../../lib/db.js';

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { relationshipId } = req.query;

  try {
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
