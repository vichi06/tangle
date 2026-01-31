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
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM relationships WHERE id = ?',
      args: [id]
    });

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    const rel = existing.rows[0];

    if (!rel.is_pending) {
      return res.status(400).json({ error: 'Relationship is not pending' });
    }

    // Only the other person (not the requester) can accept
    if (rel.pending_by === user_id) {
      return res.status(403).json({ error: 'Cannot accept your own request' });
    }

    // Verify user is part of this relationship
    if (rel.person1_id !== user_id && rel.person2_id !== user_id) {
      return res.status(403).json({ error: 'You are not part of this relationship' });
    }

    await db.execute({
      sql: 'UPDATE relationships SET is_pending = 0, pending_by = NULL WHERE id = ?',
      args: [id]
    });

    const relationship = await db.execute({
      sql: `
        SELECT
          r.*,
          p1.first_name as person1_first_name,
          p1.last_name as person1_last_name,
          p1.avatar as person1_avatar,
          p2.first_name as person2_first_name,
          p2.last_name as person2_last_name,
          p2.avatar as person2_avatar
        FROM relationships r
        JOIN people p1 ON r.person1_id = p1.id
        JOIN people p2 ON r.person2_id = p2.id
        WHERE r.id = ?
      `,
      args: [id]
    });

    // Insert TanTan bot system message
    try {
      const botResult = await db.execute("SELECT id FROM people WHERE is_system = 1");
      if (botResult.rows.length > 0) {
        const r = relationship.rows[0];
        await db.execute({
          sql: 'INSERT INTO ideas (sender_id, content) VALUES (?, ?)',
          args: [
            botResult.rows[0].id,
            `🎉 ${r.person1_first_name} and ${r.person2_first_name} are now connected!`
          ]
        });
      }
    } catch (botErr) {
      console.error('Failed to insert bot message:', botErr);
    }

    return res.json(relationship.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
