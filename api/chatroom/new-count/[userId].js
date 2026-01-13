import db from '../../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;
  const { since } = req.query;

  try {
    let result;

    if (since) {
      // Count messages created after the given timestamp, excluding user's own messages
      result = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM ideas WHERE created_at > ? AND sender_id != ?',
        args: [since, userId]
      });
    } else {
      // If no timestamp provided, return total count excluding user's own messages
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
