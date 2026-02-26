import db from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { people, relationships, clearExisting } = req.body;

  if (!people || !Array.isArray(people)) {
    return res.status(400).json({ error: 'Invalid data: people array required' });
  }

  try {
    const idMapping = {};

    if (clearExisting) {
      await db.execute('DELETE FROM relationships');
      await db.execute('DELETE FROM people');
    }

    for (const person of people) {
      const result = await db.execute({
        sql: 'INSERT INTO people (first_name, last_name, avatar, bio) VALUES (?, ?, ?, ?)',
        args: [person.first_name, person.last_name, person.avatar || null, person.bio || null]
      });
      if (person.id) {
        idMapping[person.id] = result.lastInsertRowid;
      }
    }

    let relationshipsImported = 0;
    if (relationships && Array.isArray(relationships)) {
      for (const rel of relationships) {
        const p1 = idMapping[rel.person1_id] || rel.person1_id;
        const p2 = idMapping[rel.person2_id] || rel.person2_id;
        const [id1, id2] = p1 < p2 ? [p1, p2] : [p2, p1];

        await db.execute({
          sql: 'INSERT OR IGNORE INTO relationships (person1_id, person2_id, intensity, date, context) VALUES (?, ?, ?, ?, ?)',
          args: [id1, id2, rel.intensity || 'kiss', rel.date || null, rel.context || null]
        });
        relationshipsImported++;
      }
    }

    return res.json({
      success: true,
      peopleImported: people.length,
      relationshipsImported
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
