import db from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const { intensity, date, context } = req.body;

      const existing = await db.execute({
        sql: 'SELECT * FROM relationships WHERE id = ?',
        args: [id]
      });

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Relationship not found' });
      }

      const rel = existing.rows[0];

      await db.execute({
        sql: 'UPDATE relationships SET intensity = ?, date = ?, context = ? WHERE id = ?',
        args: [
          intensity !== undefined ? intensity : rel.intensity,
          date !== undefined ? date : rel.date,
          context !== undefined ? context : rel.context,
          id
        ]
      });

      const result = await db.execute({
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

      return res.json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const existing = await db.execute({
        sql: 'SELECT * FROM relationships WHERE id = ?',
        args: [id]
      });

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Relationship not found' });
      }

      await db.execute({
        sql: 'DELETE FROM relationships WHERE id = ?',
        args: [id]
      });

      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
