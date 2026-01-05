import express from 'express';
import db from '../database.js';

const router = express.Router();

// Get all people
router.get('/', (req, res) => {
  try {
    const people = db.prepare('SELECT * FROM people ORDER BY last_name, first_name').all();
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single person
router.get('/:id', (req, res) => {
  try {
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
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
  const { first_name, last_name, avatar, bio, is_civ } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }
  try {
    const stmt = db.prepare('INSERT INTO people (first_name, last_name, avatar, bio, is_civ) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(first_name, last_name, avatar || null, bio || null, is_civ ? 1 : 0);
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update person
router.put('/:id', (req, res) => {
  const { first_name, last_name, avatar, bio, is_civ } = req.body;
  try {
    const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Person not found' });
    }
    const stmt = db.prepare('UPDATE people SET first_name = ?, last_name = ?, avatar = ?, bio = ?, is_civ = ? WHERE id = ?');
    stmt.run(
      first_name || existing.first_name,
      last_name || existing.last_name,
      avatar !== undefined ? avatar : existing.avatar,
      bio !== undefined ? bio : existing.bio,
      is_civ !== undefined ? (is_civ ? 1 : 0) : existing.is_civ,
      req.params.id
    );
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    res.json(person);
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
