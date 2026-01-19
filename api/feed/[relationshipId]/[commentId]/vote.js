import db from '../../../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { commentId } = req.query;
  const { user_id, vote } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (vote !== 1 && vote !== -1 && vote !== 0) {
    return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
  }

  try {
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
