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
          sql: `SELECT r.*, p1.first_name as person1_first_name, p1.last_name as person1_last_name, p1.avatar as person1_avatar,
            p2.first_name as person2_first_name, p2.last_name as person2_last_name, p2.avatar as person2_avatar
            FROM relationships r JOIN people p1 ON r.person1_id = p1.id JOIN people p2 ON r.person2_id = p2.id
            WHERE r.group_id = ? ORDER BY r.created_at DESC`,
          args: [groupId]
        });
      } else {
        result = await db.execute(`
          SELECT r.*, p1.first_name as person1_first_name, p1.last_name as person1_last_name, p1.avatar as person1_avatar,
            p2.first_name as person2_first_name, p2.last_name as person2_last_name, p2.avatar as person2_avatar
          FROM relationships r JOIN people p1 ON r.person1_id = p1.id JOIN people p2 ON r.person2_id = p2.id
          ORDER BY r.created_at DESC
        `);
      }
      return res.json(result.rows);
    }

    if (req.method === 'POST') {
      const { person1_id, person2_id, intensity, date, context, requester_id } = req.body;

      if (!person1_id || !person2_id) {
        return res.status(400).json({ error: 'Both person IDs are required' });
      }

      if (person1_id === person2_id) {
        return res.status(400).json({ error: 'Cannot create relationship with same person' });
      }

      const [p1, p2] = person1_id < person2_id
        ? [person1_id, person2_id]
        : [person2_id, person1_id];

      const person1 = await db.execute({ sql: 'SELECT id, is_pending, group_id FROM people WHERE id = ?', args: [p1] });
      const person2 = await db.execute({ sql: 'SELECT id, is_pending FROM people WHERE id = ?', args: [p2] });

      if (person1.rows.length === 0 || person2.rows.length === 0) {
        return res.status(400).json({ error: 'One or both people not found' });
      }

      const existing = await db.execute({
        sql: 'SELECT id FROM relationships WHERE person1_id = ? AND person2_id = ?',
        args: [p1, p2]
      });

      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Relationship already exists' });
      }

      const isPending = 1;
      const pendingBy = requester_id || person1_id;
      const groupId = person1.rows[0].group_id || null;

      const result = await db.execute({
        sql: 'INSERT INTO relationships (person1_id, person2_id, intensity, date, context, is_pending, pending_by, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [p1, p2, intensity || 'kiss', date || null, context || null, isPending, pendingBy, groupId]
      });

      const relationship = await db.execute({
        sql: `SELECT r.*,
            p1.first_name as person1_first_name, p1.last_name as person1_last_name, p1.avatar as person1_avatar,
            p2.first_name as person2_first_name, p2.last_name as person2_last_name, p2.avatar as person2_avatar
          FROM relationships r
          JOIN people p1 ON r.person1_id = p1.id
          JOIN people p2 ON r.person2_id = p2.id
          WHERE r.id = ?`,
        args: [result.lastInsertRowid]
      });

      return res.status(201).json(relationship.rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
