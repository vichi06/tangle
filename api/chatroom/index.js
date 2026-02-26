import db from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const userId = req.query.userId;
      const groupId = req.query.group_id;
      let ideasQuery = `
        SELECT i.*, p.first_name as sender_first_name, p.last_name as sender_last_name,
          p.avatar as sender_avatar, p.is_system as sender_is_system,
          COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
          COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
        FROM ideas i JOIN people p ON i.sender_id = p.id LEFT JOIN idea_votes v ON i.id = v.idea_id
      `;
      const ideasArgs = [];
      if (groupId) {
        ideasQuery += ' WHERE i.group_id = ?';
        ideasArgs.push(groupId);
      }
      ideasQuery += ' GROUP BY i.id ORDER BY i.created_at ASC';
      const result = groupId
        ? await db.execute({ sql: ideasQuery, args: ideasArgs })
        : await db.execute(ideasQuery);

      let ideas = result.rows;

      const allReactions = await db.execute(`
        SELECT message_id, emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
        FROM message_reactions
        GROUP BY message_id, emoji
      `);

      const reactionsMap = {};
      allReactions.rows.forEach(r => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        const userIds = String(r.user_ids).split(',').map(Number);
        reactionsMap[r.message_id].push({
          emoji: r.emoji,
          count: r.count,
          user_ids: userIds,
          reacted: userId ? userIds.includes(parseInt(userId)) : false
        });
      });

      if (userId) {
        const userVotes = await db.execute({
          sql: 'SELECT idea_id, vote FROM idea_votes WHERE user_id = ?',
          args: [userId]
        });
        const voteMap = Object.fromEntries(userVotes.rows.map(v => [v.idea_id, v.vote]));
        ideas = ideas.map(idea => ({ ...idea, userVote: voteMap[idea.id] || 0 }));
      }

      ideas = ideas.map(idea => ({ ...idea, reactions: reactionsMap[idea.id] || [] }));

      return res.json(ideas);
    }

    if (req.method === 'POST') {
      const { sender_id, content, mentioned_ids, group_id } = req.body;

      if (!sender_id) {
        return res.status(400).json({ error: 'Sender ID is required' });
      }

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Content is required' });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: 'Message too long (max 500 characters)' });
      }

      const sender = await db.execute({
        sql: 'SELECT id FROM people WHERE id = ?',
        args: [sender_id]
      });
      if (sender.rows.length === 0) {
        return res.status(400).json({ error: 'Sender not found' });
      }

      const insert = await db.execute({
        sql: 'INSERT INTO ideas (sender_id, content, group_id) VALUES (?, ?, ?)',
        args: [sender_id, content.trim(), group_id || null]
      });

      const messageId = insert.lastInsertRowid;

      if (mentioned_ids && Array.isArray(mentioned_ids) && mentioned_ids.length > 0) {
        for (const mentionUserId of mentioned_ids) {
          if (mentionUserId !== sender_id) {
            await db.execute({
              sql: 'INSERT OR IGNORE INTO message_mentions (message_id, mentioned_user_id) VALUES (?, ?)',
              args: [messageId, mentionUserId]
            });
          }
        }
      }

      const message = await db.execute({
        sql: `SELECT i.*, p.first_name as sender_first_name, p.last_name as sender_last_name, p.avatar as sender_avatar
          FROM ideas i JOIN people p ON i.sender_id = p.id WHERE i.id = ?`,
        args: [messageId]
      });

      return res.status(201).json(message.rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
