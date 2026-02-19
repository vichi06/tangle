import db from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse route: /api/people, /api/people/:id, /api/people/:id/verify-code, /api/people/:id/confirm
  const params = req.query.params || [];
  const id = params[0];
  const action = params[1]; // "verify-code" or "confirm"

  try {
    // GET/POST /api/people (no id)
    if (!id) {
      if (req.method === 'GET') {
        const groupId = req.query.group_id;
        let result;
        if (groupId) {
          result = await db.execute({
            sql: 'SELECT * FROM people WHERE is_system = 0 AND group_id = ? ORDER BY last_name, first_name',
            args: [groupId]
          });
        } else {
          result = await db.execute('SELECT * FROM people WHERE is_system = 0 ORDER BY last_name, first_name');
        }
        return res.json(result.rows);
      }

      if (req.method === 'POST') {
        const { first_name, last_name, avatar, bio, is_pending, group_id, is_admin, admin_code } = req.body;

        if (!first_name || !last_name) {
          return res.status(400).json({ error: 'First name and last name are required' });
        }

        const result = await db.execute({
          sql: 'INSERT INTO people (first_name, last_name, avatar, bio, is_pending, group_id, is_admin, admin_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [first_name, last_name, avatar || null, bio || null, is_pending ? 1 : 0, group_id || null, is_admin ? 1 : 0, admin_code || null]
        });

        const person = await db.execute({
          sql: 'SELECT * FROM people WHERE id = ?',
          args: [result.lastInsertRowid]
        });

        return res.status(201).json(person.rows[0]);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // POST /api/people/:id/verify-code
    if (action === 'verify-code') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: 'Code is required' });
      }

      const result = await db.execute({
        sql: 'SELECT admin_code FROM people WHERE id = ? AND is_admin = 1',
        args: [id]
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      if (result.rows[0].admin_code === code) {
        return res.json({ success: true });
      } else {
        return res.status(401).json({ error: 'Invalid code' });
      }
    }

    // POST /api/people/:id/confirm
    if (action === 'confirm') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const existing = await db.execute({
        sql: 'SELECT * FROM people WHERE id = ?',
        args: [id]
      });

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Person not found' });
      }

      if (!existing.rows[0].is_pending) {
        return res.status(400).json({ error: 'User is not pending' });
      }

      await db.execute({
        sql: 'UPDATE people SET is_pending = 0 WHERE id = ?',
        args: [id]
      });

      const updated = await db.execute({
        sql: 'SELECT * FROM people WHERE id = ?',
        args: [id]
      });

      // Insert TanTan bot welcome message
      try {
        const botResult = await db.execute("SELECT id FROM people WHERE is_system = 1");
        if (botResult.rows.length > 0) {
          await db.execute({
            sql: 'INSERT INTO ideas (sender_id, content) VALUES (?, ?)',
            args: [
              botResult.rows[0].id,
              `👋 Welcome ${existing.rows[0].first_name} to the Tangle!`
            ]
          });
        }
      } catch (botErr) {
        console.error('Failed to insert bot message:', botErr);
      }

      return res.json(updated.rows[0]);
    }

    // GET/PUT/DELETE /api/people/:id (no action)
    if (!action) {
      if (req.method === 'GET') {
        const result = await db.execute({
          sql: 'SELECT * FROM people WHERE id = ?',
          args: [id]
        });

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Person not found' });
        }

        return res.json(result.rows[0]);
      }

      if (req.method === 'PUT') {
        const { first_name, last_name, avatar, bio } = req.body;

        const existing = await db.execute({
          sql: 'SELECT * FROM people WHERE id = ?',
          args: [id]
        });

        if (existing.rows.length === 0) {
          return res.status(404).json({ error: 'Person not found' });
        }

        const person = existing.rows[0];

        await db.execute({
          sql: 'UPDATE people SET first_name = ?, last_name = ?, avatar = ?, bio = ? WHERE id = ?',
          args: [
            first_name || person.first_name,
            last_name || person.last_name,
            avatar !== undefined ? avatar : person.avatar,
            bio !== undefined ? bio : person.bio,
            id
          ]
        });

        const updated = await db.execute({
          sql: 'SELECT * FROM people WHERE id = ?',
          args: [id]
        });

        return res.json(updated.rows[0]);
      }

      if (req.method === 'DELETE') {
        const existing = await db.execute({
          sql: 'SELECT * FROM people WHERE id = ?',
          args: [id]
        });

        if (existing.rows.length === 0) {
          return res.status(404).json({ error: 'Person not found' });
        }

        await db.execute({
          sql: 'DELETE FROM relationships WHERE person1_id = ? OR person2_id = ?',
          args: [id, id]
        });

        await db.execute({
          sql: 'DELETE FROM people WHERE id = ?',
          args: [id]
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
