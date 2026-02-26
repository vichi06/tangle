import db from '../lib/db.js';

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

  try {
    const people = await db.execute('SELECT * FROM people ORDER BY id');
    const relationships = await db.execute('SELECT * FROM relationships ORDER BY id');

    return res.json({
      people: people.rows,
      relationships: relationships.rows,
      exportedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
