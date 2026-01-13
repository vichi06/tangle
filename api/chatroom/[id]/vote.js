import db from '../../../lib/db.js';

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

  const { id: ideaId } = req.query;
  const { user_id, vote } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (vote !== 1 && vote !== -1 && vote !== 0) {
    return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
  }

  try {
    // Verify idea exists
    const idea = await db.execute({
      sql: 'SELECT id FROM ideas WHERE id = ?',
      args: [ideaId]
    });
    if (idea.rows.length === 0) {
      return res.status(404).json({ error: 'Idea not found' });
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
        sql: 'DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?',
        args: [ideaId, user_id]
      });
    } else {
      // Upsert vote
      await db.execute({
        sql: `
          INSERT INTO idea_votes (idea_id, user_id, vote)
          VALUES (?, ?, ?)
          ON CONFLICT(idea_id, user_id) DO UPDATE SET vote = excluded.vote
        `,
        args: [ideaId, user_id, vote]
      });
    }

    // Return updated vote counts
    const counts = await db.execute({
      sql: `
        SELECT
          COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
          COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
        FROM idea_votes
        WHERE idea_id = ?
      `,
      args: [ideaId]
    });

    return res.json({
      idea_id: parseInt(ideaId),
      upvotes: counts.rows[0].upvotes,
      downvotes: counts.rows[0].downvotes,
      userVote: vote
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
