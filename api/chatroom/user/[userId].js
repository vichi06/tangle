import db from '../../../lib/db.js';


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { userId } = req.query;

  if (req.method === 'GET') {
    const { action, since } = req.query;

    if (action === 'cooldown') {
      return res.json({ canSend: true, remainingMs: 0 });
    }

    if (action === 'new-count') {
      try {
        let result;
        if (since) {
          result = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM ideas WHERE created_at > ? AND sender_id != ?',
            args: [since, userId]
          });
        } else {
          result = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM ideas WHERE sender_id != ?',
            args: [userId]
          });
        }
        return res.json({ count: result.rows[0].count });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'mentions-count') {
      try {
        const result = await db.execute({
          sql: 'SELECT COUNT(*) as count FROM message_mentions WHERE mentioned_user_id = ? AND seen = 0',
          args: [userId]
        });
        return res.json({ count: result.rows[0].count });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use: cooldown, new-count, mentions-count' });
  }

  if (req.method === 'POST') {
    const { action } = req.body;

    if (action === 'mark-seen') {
      try {
        await db.execute({
          sql: 'UPDATE message_mentions SET seen = 1 WHERE mentioned_user_id = ? AND seen = 0',
          args: [userId]
        });
        return res.json({ success: true });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use: mark-seen' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
