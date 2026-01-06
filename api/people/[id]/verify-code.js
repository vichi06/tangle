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
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }

  try {
    const result = await db.execute({
      sql: 'SELECT admin_code FROM people WHERE id = ? AND is_admin = 1',
      args: [id]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    if (result.rows[0].admin_code === code) {
      return res.json({ success: true });
    } else {
      return res.status(401).json({ error: 'Invalid code' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
