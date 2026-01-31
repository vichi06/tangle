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

  const { id } = req.query;
  const { action, user_id, vote, emoji } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (action === 'vote') {
    if (vote !== 1 && vote !== -1 && vote !== 0) {
      return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
    }

    try {
      const idea = await db.execute({
        sql: 'SELECT id FROM ideas WHERE id = ?',
        args: [id]
      });
      if (idea.rows.length === 0) {
        return res.status(404).json({ error: 'Idea not found' });
      }

      const user = await db.execute({
        sql: 'SELECT id FROM people WHERE id = ?',
        args: [user_id]
      });
      if (user.rows.length === 0) {
        return res.status(400).json({ error: 'User not found' });
      }

      if (vote === 0) {
        await db.execute({
          sql: 'DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?',
          args: [id, user_id]
        });
      } else {
        await db.execute({
          sql: `
            INSERT INTO idea_votes (idea_id, user_id, vote)
            VALUES (?, ?, ?)
            ON CONFLICT(idea_id, user_id) DO UPDATE SET vote = excluded.vote
          `,
          args: [id, user_id, vote]
        });
      }

      const counts = await db.execute({
        sql: `
          SELECT
            COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
            COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
          FROM idea_votes
          WHERE idea_id = ?
        `,
        args: [id]
      });

      return res.json({
        idea_id: parseInt(id),
        upvotes: counts.rows[0].upvotes,
        downvotes: counts.rows[0].downvotes,
        userVote: vote
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'react') {
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    try {
      const message = await db.execute({
        sql: 'SELECT id FROM ideas WHERE id = ?',
        args: [id]
      });
      if (message.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const user = await db.execute({
        sql: 'SELECT id FROM people WHERE id = ?',
        args: [user_id]
      });
      if (user.rows.length === 0) {
        return res.status(400).json({ error: 'User not found' });
      }

      const existing = await db.execute({
        sql: 'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        args: [id, user_id, emoji]
      });

      if (existing.rows.length > 0) {
        await db.execute({
          sql: 'DELETE FROM message_reactions WHERE id = ?',
          args: [existing.rows[0].id]
        });
      } else {
        await db.execute({
          sql: 'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
          args: [id, user_id, emoji]
        });
      }

      const reactions = await db.execute({
        sql: `
          SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
          FROM message_reactions
          WHERE message_id = ?
          GROUP BY emoji
        `,
        args: [id]
      });

      return res.json({
        message_id: parseInt(id),
        reactions: reactions.rows.map(r => {
          const userIds = r.user_ids.split(',').map(Number);
          return {
            emoji: r.emoji,
            count: r.count,
            user_ids: userIds,
            reacted: userIds.includes(user_id)
          };
        })
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: vote, react' });
}
