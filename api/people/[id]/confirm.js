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

  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM people WHERE id = ?',
      args: [id]
    });

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }

    if (!existing.rows[0].is_pending) {
      return res.status(400).json({ error: 'User is not pending' });
    }

    await db.execute({
      sql: 'UPDATE people SET is_pending = 0 WHERE id = ?',
      args: [id]
    });

    const updated = await db.execute({
      sql: 'SELECT * FROM people WHERE id = ?',
      args: [id]
    });

    // Insert TanTan bot welcome message
    try {
      const botResult = await db.execute("SELECT id FROM people WHERE is_system = 1");
      if (botResult.rows.length > 0) {
        await db.execute({
          sql: 'INSERT INTO ideas (sender_id, content) VALUES (?, ?)',
          args: [
            botResult.rows[0].id,
            `👋 Welcome ${existing.rows[0].first_name} to the Tangle!`
          ]
        });
      }
    } catch (botErr) {
      console.error('Failed to insert bot message:', botErr);
    }

    return res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
