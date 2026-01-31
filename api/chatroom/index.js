import db from '../../lib/db.js';

const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

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
      const result = await db.execute(`
        SELECT
          i.*,
          p.first_name as sender_first_name,
          p.last_name as sender_last_name,
          p.avatar as sender_avatar,
          p.is_system as sender_is_system,
          COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
          COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
        FROM ideas i
        JOIN people p ON i.sender_id = p.id
        LEFT JOIN idea_votes v ON i.id = v.idea_id
        GROUP BY i.id
        ORDER BY i.created_at ASC
      `);

      let ideas = result.rows;

      // Get all reactions grouped by message
      const allReactions = await db.execute(`
        SELECT message_id, emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
        FROM message_reactions
        GROUP BY message_id, emoji
      `);

      // Build reactions map by message_id
      const reactionsMap = {};
      allReactions.rows.forEach(r => {
        if (!reactionsMap[r.message_id]) {
          reactionsMap[r.message_id] = [];
        }
        const userIds = String(r.user_ids).split(',').map(Number);
        reactionsMap[r.message_id].push({
          emoji: r.emoji,
          count: r.count,
          user_ids: userIds,
          reacted: userId ? userIds.includes(parseInt(userId)) : false
        });
      });

      // If userId provided, get user's votes
      if (userId) {
        const userVotes = await db.execute({
          sql: 'SELECT idea_id, vote FROM idea_votes WHERE user_id = ?',
          args: [userId]
        });
        const voteMap = Object.fromEntries(userVotes.rows.map(v => [v.idea_id, v.vote]));
        ideas = ideas.map(idea => ({
          ...idea,
          userVote: voteMap[idea.id] || 0
        }));
      }

      // Add reactions to each idea
      ideas = ideas.map(idea => ({
        ...idea,
        reactions: reactionsMap[idea.id] || []
      }));

      return res.json(ideas);
    }

    if (req.method === 'POST') {
      const { sender_id, content, mentioned_ids } = req.body;

      if (!sender_id) {
        return res.status(400).json({ error: 'Sender ID is required' });
      }

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Content is required' });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: 'Message too long (max 500 characters)' });
      }

      // Verify sender exists
      const sender = await db.execute({
        sql: 'SELECT id FROM people WHERE id = ?',
        args: [sender_id]
      });
      if (sender.rows.length === 0) {
        return res.status(400).json({ error: 'Sender not found' });
      }

      // Check cooldown
      const lastMessage = await db.execute({
        sql: 'SELECT created_at FROM ideas WHERE sender_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [sender_id]
      });

      if (lastMessage.rows.length > 0) {
        const lastTime = new Date(lastMessage.rows[0].created_at + 'Z').getTime();
        const now = Date.now();
        const elapsed = now - lastTime;

        if (elapsed < COOLDOWN_MS) {
          const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
          return res.status(429).json({
            error: `Please wait ${remaining} minutes before sending another message`,
            remainingMs: COOLDOWN_MS - elapsed
          });
        }
      }

      // Insert new message
      const insert = await db.execute({
        sql: 'INSERT INTO ideas (sender_id, content) VALUES (?, ?)',
        args: [sender_id, content.trim()]
      });

      const messageId = insert.lastInsertRowid;

      // Insert mentions if any (exclude self-mentions)
      if (mentioned_ids && Array.isArray(mentioned_ids) && mentioned_ids.length > 0) {
        for (const userId of mentioned_ids) {
          if (userId !== sender_id) {
            await db.execute({
              sql: 'INSERT OR IGNORE INTO message_mentions (message_id, mentioned_user_id) VALUES (?, ?)',
              args: [messageId, userId]
            });
          }
        }
      }

      // Return with sender info
      const message = await db.execute({
        sql: `
          SELECT
            i.*,
            p.first_name as sender_first_name,
            p.last_name as sender_last_name,
            p.avatar as sender_avatar
          FROM ideas i
          JOIN people p ON i.sender_id = p.id
          WHERE i.id = ?
        `,
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
