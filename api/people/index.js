import db from '../../lib/db.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const result = await db.execute('SELECT * FROM people WHERE is_system = 0 ORDER BY last_name, first_name');
      return res.json(result.rows);
    }

    if (req.method === 'POST') {
      const { first_name, last_name, avatar, bio, is_external, is_pending } = req.body;

      if (!first_name || !last_name) {
        return res.status(400).json({ error: 'First name and last name are required' });
      }

      const result = await db.execute({
        sql: 'INSERT INTO people (first_name, last_name, avatar, bio, is_external, is_pending) VALUES (?, ?, ?, ?, ?, ?)',
        args: [first_name, last_name, avatar || null, bio || null, is_external ? 1 : 0, is_pending ? 1 : 0]
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
