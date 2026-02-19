import express from 'express';
import db from '../database.js';

const router = express.Router();

// Get all relationships with person names
router.get('/', (req, res) => {
  try {
    const { group_id } = req.query;
    let query = `
      SELECT
        r.*,
        p1.first_name as person1_first_name,
        p1.last_name as person1_last_name,
        p1.avatar as person1_avatar,
        p2.first_name as person2_first_name,
        p2.last_name as person2_last_name,
        p2.avatar as person2_avatar
      FROM relationships r
      JOIN people p1 ON r.person1_id = p1.id
      JOIN people p2 ON r.person2_id = p2.id
    `;
    const params = [];
    if (group_id) {
      query += ' WHERE p1.group_id = ?';
      params.push(group_id);
    }
    query += ' ORDER BY r.created_at DESC';
    const relationships = db.prepare(query).all(...params);
    res.json(relationships);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create relationship
router.post('/', (req, res) => {
  const { person1_id, person2_id, intensity, date, context, requester_id } = req.body;

  if (!person1_id || !person2_id) {
    return res.status(400).json({ error: 'Both person IDs are required' });
  }

  if (person1_id === person2_id) {
    return res.status(400).json({ error: 'Cannot create relationship with same person' });
  }

  // Ensure consistent ordering (lower ID first)
  const [p1, p2] = person1_id < person2_id
    ? [person1_id, person2_id]
    : [person2_id, person1_id];

  try {
    // Check if people exist
    const person1 = db.prepare('SELECT id, is_pending FROM people WHERE id = ?').get(p1);
    const person2 = db.prepare('SELECT id, is_pending FROM people WHERE id = ?').get(p2);

    if (!person1 || !person2) {
      return res.status(400).json({ error: 'One or both people not found' });
    }

    // Check if relationship already exists
    const existing = db.prepare(
      'SELECT id FROM relationships WHERE person1_id = ? AND person2_id = ?'
    ).get(p1, p2);

    if (existing) {
      return res.status(400).json({ error: 'Relationship already exists' });
    }

    // All new relationships are pending until the other person accepts
    const isPending = 1;
    const pendingBy = requester_id || person1_id;

    const stmt = db.prepare(
      'INSERT INTO relationships (person1_id, person2_id, intensity, date, context, is_pending, pending_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(p1, p2, intensity || 'kiss', date || null, context || null, isPending, pendingBy);

    const relationship = db.prepare(`
      SELECT
        r.*,
        p1.first_name as person1_first_name,
        p1.last_name as person1_last_name,
        p1.avatar as person1_avatar,
        p2.first_name as person2_first_name,
        p2.last_name as person2_last_name,
        p2.avatar as person2_avatar
      FROM relationships r
      JOIN people p1 ON r.person1_id = p1.id
      JOIN people p2 ON r.person2_id = p2.id
      WHERE r.id = ?
    `).get(result.lastInsertRowid);

    // Insert TanTan bot system message (only for confirmed relationships)
    if (!isPending) {
      try {
        const bot = db.prepare('SELECT id FROM people WHERE is_system = 1').get();
        if (bot) {
          const msg = `🎉 ${relationship.person1_first_name} and ${relationship.person2_first_name} are now connected!`;
          db.prepare('INSERT INTO ideas (sender_id, content) VALUES (?, ?)').run(bot.id, msg);
        }
      } catch (botErr) {
        console.error('Failed to insert bot message:', botErr);
      }
    }

    res.status(201).json(relationship);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept pending relationship
router.post('/:id', (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const existing = db.prepare('SELECT * FROM relationships WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    if (!existing.is_pending) {
      return res.status(400).json({ error: 'Relationship is not pending' });
    }

    // Only the other person (not the requester) can accept
    if (existing.pending_by === user_id) {
      return res.status(403).json({ error: 'Cannot accept your own request' });
    }

    // Verify user is part of this relationship
    if (existing.person1_id !== user_id && existing.person2_id !== user_id) {
      return res.status(403).json({ error: 'You are not part of this relationship' });
    }

    db.prepare('UPDATE relationships SET is_pending = 0, pending_by = NULL WHERE id = ?').run(req.params.id);

    const relationship = db.prepare(`
      SELECT
        r.*,
        p1.first_name as person1_first_name,
        p1.last_name as person1_last_name,
        p1.avatar as person1_avatar,
        p2.first_name as person2_first_name,
        p2.last_name as person2_last_name,
        p2.avatar as person2_avatar
      FROM relationships r
      JOIN people p1 ON r.person1_id = p1.id
      JOIN people p2 ON r.person2_id = p2.id
      WHERE r.id = ?
    `).get(req.params.id);

    // Insert TanTan bot system message
    try {
      const bot = db.prepare('SELECT id FROM people WHERE is_system = 1').get();
      if (bot) {
        const personGroup = db.prepare('SELECT group_id FROM people WHERE id = ?').get(relationship.person1_id);
        db.prepare('INSERT INTO ideas (sender_id, content, group_id) VALUES (?, ?, ?)').run(
          bot.id,
          `🎉 ${relationship.person1_first_name} and ${relationship.person2_first_name} are now connected!`,
          personGroup?.group_id || null
        );
      }
    } catch (botErr) {
      console.error('Failed to insert bot message:', botErr);
    }

    res.json(relationship);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update relationship
router.put('/:id', (req, res) => {
  const { intensity, date, context } = req.body;
  try {
    const existing = db.prepare('SELECT * FROM relationships WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    const stmt = db.prepare('UPDATE relationships SET intensity = ?, date = ?, context = ? WHERE id = ?');
    stmt.run(
      intensity !== undefined ? intensity : existing.intensity,
      date !== undefined ? date : existing.date,
      context !== undefined ? context : existing.context,
      req.params.id
    );

    const relationship = db.prepare(`
      SELECT
        r.*,
        p1.first_name as person1_first_name,
        p1.last_name as person1_last_name,
        p1.avatar as person1_avatar,
        p2.first_name as person2_first_name,
        p2.last_name as person2_last_name,
        p2.avatar as person2_avatar
      FROM relationships r
      JOIN people p1 ON r.person1_id = p1.id
      JOIN people p2 ON r.person2_id = p2.id
      WHERE r.id = ?
    `).get(req.params.id);

    res.json(relationship);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete relationship
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM relationships WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Relationship not found' });
    }
    db.prepare('DELETE FROM relationships WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
