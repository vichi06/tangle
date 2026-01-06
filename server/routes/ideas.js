import express from 'express';
import db from '../database.js';

const router = express.Router();

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

// Get all ideas with sender info
router.get('/', (req, res) => {
  try {
    const ideas = db.prepare(`
      SELECT
        i.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar
      FROM ideas i
      JOIN people p ON i.sender_id = p.id
      ORDER BY i.created_at ASC
    `).all();
    res.json(ideas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check cooldown status for a user
router.get('/cooldown/:userId', (req, res) => {
  try {
    const lastIdea = db.prepare(`
      SELECT created_at FROM ideas
      WHERE sender_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.params.userId);

    if (!lastIdea) {
      return res.json({ canSend: true, remainingMs: 0 });
    }

    const lastTime = new Date(lastIdea.created_at + 'Z').getTime();
    const now = Date.now();
    const elapsed = now - lastTime;
    const remaining = Math.max(0, COOLDOWN_MS - elapsed);

    res.json({
      canSend: remaining === 0,
      remainingMs: remaining
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit new idea
router.post('/', (req, res) => {
  const { sender_id, content } = req.body;

  // Validation
  if (!sender_id) {
    return res.status(400).json({ error: 'Sender ID is required' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  if (content.length > 500) {
    return res.status(400).json({ error: 'Message too long (max 500 characters)' });
  }

  try {
    // Verify sender exists
    const sender = db.prepare('SELECT id FROM people WHERE id = ?').get(sender_id);
    if (!sender) {
      return res.status(400).json({ error: 'Sender not found' });
    }

    // Check cooldown
    const lastIdea = db.prepare(`
      SELECT created_at FROM ideas
      WHERE sender_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sender_id);

    if (lastIdea) {
      const lastTime = new Date(lastIdea.created_at + 'Z').getTime();
      const now = Date.now();
      const elapsed = now - lastTime;

      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        return res.status(429).json({
          error: `Please wait ${remaining} minutes before sending another idea`,
          remainingMs: COOLDOWN_MS - elapsed
        });
      }
    }

    // Insert new idea
    const stmt = db.prepare('INSERT INTO ideas (sender_id, content) VALUES (?, ?)');
    const result = stmt.run(sender_id, content.trim());

    // Return with sender info
    const idea = db.prepare(`
      SELECT
        i.*,
        p.first_name as sender_first_name,
        p.last_name as sender_last_name,
        p.avatar as sender_avatar
      FROM ideas i
      JOIN people p ON i.sender_id = p.id
      WHERE i.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(idea);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
