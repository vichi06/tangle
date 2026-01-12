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
    if (req.method === 'GET') {
      const result = await db.execute({
        sql: 'SELECT * FROM people WHERE id = ?',
        args: [id]
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Person not found' });
      }

      return res.json(result.rows[0]);
    }

    if (req.method === 'PUT') {
      const { first_name, last_name, avatar, bio, is_external } = req.body;

      const existing = await db.execute({
        sql: 'SELECT * FROM people WHERE id = ?',
        args: [id]
      });

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Person not found' });
      }

      const person = existing.rows[0];

      await db.execute({
        sql: 'UPDATE people SET first_name = ?, last_name = ?, avatar = ?, bio = ?, is_external = ? WHERE id = ?',
        args: [
          first_name || person.first_name,
          last_name || person.last_name,
          avatar !== undefined ? avatar : person.avatar,
          bio !== undefined ? bio : person.bio,
          is_external !== undefined ? (is_external ? 1 : 0) : person.is_external,
          id
        ]
      });

      const updated = await db.execute({
        sql: 'SELECT * FROM people WHERE id = ?',
        args: [id]
      });

      return res.json(updated.rows[0]);
    }

    if (req.method === 'DELETE') {
      const existing = await db.execute({
        sql: 'SELECT * FROM people WHERE id = ?',
        args: [id]
      });

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Person not found' });
      }

      await db.execute({
        sql: 'DELETE FROM relationships WHERE person1_id = ? OR person2_id = ?',
        args: [id, id]
      });

      await db.execute({
        sql: 'DELETE FROM people WHERE id = ?',
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
