import db from '../../../lib/db.js';

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

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
      sql: 'SELECT created_at FROM ideas WHERE sender_id = ? ORDER BY created_at DESC LIMIT 1',
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
