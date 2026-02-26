import db from '../../lib/db.js';
import { generateGroupCode } from '../../lib/codeGenerator.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
