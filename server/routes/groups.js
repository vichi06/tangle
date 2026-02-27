import express from 'express';
import db from '../database.js';
import { generateGroupCode } from '../../lib/codeGenerator.js';

const router = express.Router();

// GET /api/groups — list all groups with member counts
router.get('/', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT g.id, g.name, g.code, g.created_by, g.created_at,
        COUNT(p.id) as member_count
      FROM groups g
      LEFT JOIN people p ON p.group_id = g.id AND p.is_system = 0
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `).all();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/:code — get group by code
router.get('/:code', (req, res) => {
  try {
    const group = db.prepare(`
      SELECT g.id, g.name, g.code, g.created_by, g.created_at,
        COUNT(p.id) as member_count
      FROM groups g
      LEFT JOIN people p ON p.group_id = g.id AND p.is_system = 0
      WHERE g.code = ?
      GROUP BY g.id
    `).get(req.params.code);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups — create group
router.post('/', (req, res) => {
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
  try {
    // Case-insensitive uniqueness check
    const existing = db.prepare('SELECT id FROM groups WHERE LOWER(name) = LOWER(?)').get(trimmed);
    if (existing) {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    const code = generateGroupCode();
    db.prepare('INSERT INTO groups (name, code) VALUES (?, ?)').run(trimmed, code);
    const group = db.prepare('SELECT * FROM groups WHERE code = ?').get(code);
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/groups/:code/creator — set created_by after first profile
router.put('/:code/creator', (req, res) => {
  const { created_by } = req.body;
  if (!created_by) {
    return res.status(400).json({ error: 'created_by is required' });
  }
  try {
    const group = db.prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    db.prepare('UPDATE groups SET created_by = ? WHERE code = ?').run(created_by, req.params.code);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/groups/:code — delete group (requires admin_code)
router.delete('/:code', (req, res) => {
  const { admin_code } = req.body;
  if (!admin_code) {
    return res.status(400).json({ error: 'Admin code is required' });
  }
  try {
    const group = db.prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    // Verify admin code against the group creator
    if (!group.created_by) {
      return res.status(403).json({ error: 'Group has no creator' });
    }
    const creator = db.prepare('SELECT admin_code FROM people WHERE id = ? AND is_admin = 1').get(group.created_by);
    if (!creator || creator.admin_code !== admin_code) {
      return res.status(401).json({ error: 'Invalid admin code' });
    }

    // Application-level cascade: delete all group data
    const groupPeople = db.prepare('SELECT id FROM people WHERE group_id = ?').all(group.id);
    const personIds = groupPeople.map(p => p.id);

    if (personIds.length > 0) {
      const placeholders = personIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM relationships WHERE person1_id IN (${placeholders}) OR person2_id IN (${placeholders})`).run(...personIds, ...personIds);
      db.prepare(`DELETE FROM messages WHERE sender_id IN (${placeholders})`).run(...personIds);
      db.prepare(`DELETE FROM people WHERE group_id = ?`).run(group.id);
    }
    db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
