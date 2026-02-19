import db from '../../lib/db.js';
import { generateGroupCode } from '../../lib/codeGenerator.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const params = req.query.params || [];
  const code = params[0];
  const action = params[1]; // "creator"

  try {
    // GET/POST /api/groups (no code)
    if (!code) {
      if (req.method === 'GET') {
        const result = await db.execute(`
          SELECT g.id, g.name, g.code, g.created_by, g.created_at,
            COUNT(p.id) as member_count
          FROM groups g
          LEFT JOIN people p ON p.group_id = g.id AND p.is_system = 0
          GROUP BY g.id
          ORDER BY g.created_at DESC
        `);
        return res.json(result.rows);
      }

      if (req.method === 'POST') {
        const { name } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).json({ error: 'Group name is required' });
        }
        const trimmed = name.trim();
        if (trimmed.length < 3 || trimmed.length > 30) {
          return res.status(400).json({ error: 'Group name must be 3-30 characters' });
        }
        if (!/^[a-zA-Z0-9\s\-]+$/.test(trimmed)) {
          return res.status(400).json({ error: 'Group name can only contain letters, numbers, spaces, and hyphens' });
        }

        const existing = await db.execute({
          sql: 'SELECT id FROM groups WHERE LOWER(name) = LOWER(?)',
          args: [trimmed]
        });
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'A group with this name already exists' });
        }

        const groupCode = generateGroupCode();
        await db.execute({
          sql: 'INSERT INTO groups (name, code) VALUES (?, ?)',
          args: [trimmed, groupCode]
        });
        const group = await db.execute({
          sql: 'SELECT * FROM groups WHERE code = ?',
          args: [groupCode]
        });
        return res.status(201).json(group.rows[0]);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // PUT /api/groups/:code/creator
    if (action === 'creator') {
      if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const { created_by } = req.body;
      if (!created_by) {
        return res.status(400).json({ error: 'created_by is required' });
      }
      const group = await db.execute({
        sql: 'SELECT * FROM groups WHERE code = ?',
        args: [code]
      });
      if (group.rows.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      await db.execute({
        sql: 'UPDATE groups SET created_by = ? WHERE code = ?',
        args: [created_by, code]
      });
      return res.json({ success: true });
    }

    // GET/DELETE /api/groups/:code
    if (!action) {
      if (req.method === 'GET') {
        const result = await db.execute({
          sql: `SELECT g.id, g.name, g.code, g.created_by, g.created_at,
            COUNT(p.id) as member_count
          FROM groups g
          LEFT JOIN people p ON p.group_id = g.id AND p.is_system = 0
          WHERE g.code = ?
          GROUP BY g.id`,
          args: [code]
        });
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Group not found' });
        }
        return res.json(result.rows[0]);
      }

      if (req.method === 'DELETE') {
        const { admin_code } = req.body;
        if (!admin_code) {
          return res.status(400).json({ error: 'Admin code is required' });
        }

        const groupResult = await db.execute({
          sql: 'SELECT * FROM groups WHERE code = ?',
          args: [code]
        });
        if (groupResult.rows.length === 0) {
          return res.status(404).json({ error: 'Group not found' });
        }
        const group = groupResult.rows[0];

        if (!group.created_by) {
          return res.status(403).json({ error: 'Group has no creator' });
        }
        const creator = await db.execute({
          sql: 'SELECT admin_code FROM people WHERE id = ? AND is_admin = 1',
          args: [group.created_by]
        });
        if (creator.rows.length === 0 || creator.rows[0].admin_code !== admin_code) {
          return res.status(401).json({ error: 'Invalid admin code' });
        }

        // Application-level cascade
        const groupPeople = await db.execute({
          sql: 'SELECT id FROM people WHERE group_id = ?',
          args: [group.id]
        });
        const personIds = groupPeople.rows.map(p => p.id);

        if (personIds.length > 0) {
          const placeholders = personIds.map(() => '?').join(',');
          await db.execute({
            sql: `DELETE FROM relationships WHERE person1_id IN (${placeholders}) OR person2_id IN (${placeholders})`,
            args: [...personIds, ...personIds]
          });
          await db.execute({
            sql: `DELETE FROM ideas WHERE sender_id IN (${placeholders})`,
            args: personIds
          });
          await db.execute({
            sql: 'DELETE FROM people WHERE group_id = ?',
            args: [group.id]
          });
        }
        await db.execute({
          sql: 'DELETE FROM groups WHERE id = ?',
          args: [group.id]
        });

        return res.json({ success: true });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
