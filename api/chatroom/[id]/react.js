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

  const { id: messageId } = req.query;
  const { user_id, emoji } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!emoji) {
    return res.status(400).json({ error: 'Emoji is required' });
  }

  try {
    // Verify message exists
    const message = await db.execute({
      sql: 'SELECT id FROM ideas WHERE id = ?',
      args: [messageId]
    });
    if (message.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user exists
    const user = await db.execute({
      sql: 'SELECT id FROM people WHERE id = ?',
      args: [user_id]
    });
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check if reaction exists (toggle behavior)
    const existing = await db.execute({
      sql: 'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      args: [messageId, user_id, emoji]
    });

    if (existing.rows.length > 0) {
      // Remove reaction
      await db.execute({
        sql: 'DELETE FROM message_reactions WHERE id = ?',
        args: [existing.rows[0].id]
      });
    } else {
      // Add reaction
      await db.execute({
        sql: 'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
        args: [messageId, user_id, emoji]
      });
    }

    // Return updated reactions for this message
    const reactions = await db.execute({
      sql: `
        SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
        FROM message_reactions
        WHERE message_id = ?
        GROUP BY emoji
      `,
      args: [messageId]
    });

    return res.json({
      message_id: parseInt(messageId),
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
