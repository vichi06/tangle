import express from 'express';
import db from '../database.js';

const router = express.Router();

// Export all data as JSON
router.get('/export', (req, res) => {
  try {
    const people = db.prepare('SELECT * FROM people ORDER BY id').all();
    const relationships = db.prepare('SELECT * FROM relationships ORDER BY id').all();

    res.json({
      people,
      relationships,
      exportedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import data from JSON
router.post('/import', (req, res) => {
  const { people, relationships, clearExisting } = req.body;

  if (!people || !Array.isArray(people)) {
    return res.status(400).json({ error: 'Invalid data: people array required' });
  }

  try {
    const importTransaction = db.transaction(() => {
      const idMapping = {};

      // Clear existing data if requested
      if (clearExisting) {
        db.prepare('DELETE FROM relationships').run();
        db.prepare('DELETE FROM people').run();
      }

      // Import people
      const insertPerson = db.prepare(
        'INSERT INTO people (first_name, last_name, avatar, bio) VALUES (?, ?, ?, ?)'
      );

      for (const person of people) {
        const result = insertPerson.run(
          person.first_name,
          person.last_name,
          person.avatar || null,
          person.bio || null
        );
        // Map old ID to new ID for relationship import
        if (person.id) {
          idMapping[person.id] = result.lastInsertRowid;
        }
      }

      // Import relationships
      if (relationships && Array.isArray(relationships)) {
        const insertRelationship = db.prepare(
          'INSERT OR IGNORE INTO relationships (person1_id, person2_id, intensity, date, context) VALUES (?, ?, ?, ?, ?)'
        );

        for (const rel of relationships) {
          const p1 = idMapping[rel.person1_id] || rel.person1_id;
          const p2 = idMapping[rel.person2_id] || rel.person2_id;

          // Ensure consistent ordering
          const [id1, id2] = p1 < p2 ? [p1, p2] : [p2, p1];

          insertRelationship.run(id1, id2, rel.intensity || 'kiss', rel.date || null, rel.context || null);
        }
      }

      return {
        peopleImported: people.length,
        relationshipsImported: relationships?.length || 0
      };
    });

    const result = importTransaction();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
