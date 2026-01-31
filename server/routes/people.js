import express from 'express';
import db from '../database.js';

const router = express.Router();

// Get all people (exclude admin_code for security)
router.get('/', (req, res) => {
  try {
    const people = db.prepare(`
      SELECT id, first_name, last_name, avatar, bio, is_external, is_admin, is_pending, created_at
      FROM people WHERE is_system = 0 ORDER BY last_name, first_name
    `).all();
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single person (exclude admin_code for security)
router.get('/:id', (req, res) => {
  try {
    const person = db.prepare(`
      SELECT id, first_name, last_name, avatar, bio, is_external, is_admin, is_pending, created_at
      FROM people WHERE id = ?
    `).get(req.params.id);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }
    res.json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create person
router.post('/', (req, res) => {
  const { first_name, last_name, avatar, bio, is_external, is_pending } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }
  try {
    const stmt = db.prepare('INSERT INTO people (first_name, last_name, avatar, bio, is_external, is_pending) VALUES (?, ?, ?, ?, ?, ?)');
    const result = stmt.run(first_name, last_name, avatar || null, bio || null, is_external ? 1 : 0, is_pending ? 1 : 0);
    const person = db.prepare(`
      SELECT id, first_name, last_name, avatar, bio, is_external, is_admin, is_pending, created_at
      FROM people WHERE id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update person (admin fields are set directly in DB)
router.put('/:id', (req, res) => {
  const { first_name, last_name, avatar, bio, is_external } = req.body;
  try {
    const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Person not found' });
    }
    const stmt = db.prepare('UPDATE people SET first_name = ?, last_name = ?, avatar = ?, bio = ?, is_external = ? WHERE id = ?');
    stmt.run(
      first_name || existing.first_name,
      last_name || existing.last_name,
      avatar !== undefined ? avatar : existing.avatar,
      bio !== undefined ? bio : existing.bio,
      is_external !== undefined ? (is_external ? 1 : 0) : existing.is_external,
      req.params.id
    );
    const person = db.prepare(`
      SELECT id, first_name, last_name, avatar, bio, is_external, is_admin, is_pending, created_at
      FROM people WHERE id = ?
    `).get(req.params.id);
    res.json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify admin code
router.post('/:id/verify-code', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }
  try {
    const person = db.prepare('SELECT admin_code FROM people WHERE id = ? AND is_admin = 1').get(req.params.id);
    if (!person) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    if (person.admin_code === code) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid code' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm pending user profile
router.post('/:id/confirm', (req, res) => {
  try {
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }
    if (!person.is_pending) {
      return res.status(400).json({ error: 'User is not pending' });
    }
    db.prepare('UPDATE people SET is_pending = 0 WHERE id = ?').run(req.params.id);
    const updated = db.prepare(`
      SELECT id, first_name, last_name, avatar, bio, is_external, is_admin, is_pending, created_at
      FROM people WHERE id = ?
    `).get(req.params.id);

    // Insert TanTan bot welcome message
    try {
      const bot = db.prepare('SELECT id FROM people WHERE is_system = 1').get();
      if (bot) {
        db.prepare('INSERT INTO ideas (sender_id, content) VALUES (?, ?)').run(
          bot.id,
          `👋 Welcome ${person.first_name} to the Tangle!`
        );
      }
    } catch (botErr) {
      console.error('Failed to insert bot message:', botErr);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete person
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Person not found' });
    }
    db.prepare('DELETE FROM relationships WHERE person1_id = ? OR person2_id = ?').run(req.params.id, req.params.id);
    db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
