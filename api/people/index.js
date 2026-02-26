import db from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const groupId = req.query.group_id;
      let result;
      if (groupId) {
        result = await db.execute({
          sql: 'SELECT * FROM people WHERE is_system = 0 AND group_id = ? ORDER BY last_name, first_name',
          args: [groupId]
        });
      } else {
        result = await db.execute('SELECT * FROM people WHERE is_system = 0 ORDER BY last_name, first_name');
      }
      return res.json(result.rows);
    }

    if (req.method === 'POST') {
      const { first_name, last_name, avatar, bio, is_pending, group_id, is_admin, admin_code } = req.body;

      if (!first_name || !last_name) {
        return res.status(400).json({ error: 'First name and last name are required' });
      }

      const result = await db.execute({
        sql: 'INSERT INTO people (first_name, last_name, avatar, bio, is_pending, group_id, is_admin, admin_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [first_name, last_name, avatar || null, bio || null, is_pending ? 1 : 0, group_id || null, is_admin ? 1 : 0, admin_code || null]
      });

      const person = await db.execute({
        sql: 'SELECT * FROM people WHERE id = ?',
        args: [result.lastInsertRowid]
      });

      return res.status(201).json(person.rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
