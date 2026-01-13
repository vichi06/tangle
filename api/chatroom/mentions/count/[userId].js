import db from '../../../../lib/db.js';

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
