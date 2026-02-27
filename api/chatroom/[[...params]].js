import db from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse route: /api/chatroom, /api/chatroom/:id/action, /api/chatroom/user/:userId
  const params = req.query.params
    ? (Array.isArray(req.query.params) ? req.query.params : [req.query.params])
    : req.url.split('?')[0].split('/').filter(Boolean).slice(2);

  try {
    // GET/POST /api/chatroom/user/:userId
    if (params[0] === 'user' && params[1]) {
      const userId = params[1];

      if (req.method === 'GET') {
        const { action, since, group_id } = req.query;

        if (action === 'cooldown') {
          return res.json({ canSend: true, remainingMs: 0 });
        }

        if (action === 'new-count') {
          let result;
          if (group_id) {
            if (since) {
              result = await db.execute({
                sql: 'SELECT COUNT(*) as count FROM messages i JOIN people p ON i.sender_id = p.id WHERE i.created_at > ? AND i.sender_id != ? AND i.group_id = ?',
                args: [since, userId, group_id]
              });
            } else {
              result = await db.execute({
                sql: 'SELECT COUNT(*) as count FROM messages i JOIN people p ON i.sender_id = p.id WHERE i.sender_id != ? AND i.group_id = ?',
                args: [userId, group_id]
              });
            }
          } else {
            if (since) {
              result = await db.execute({
                sql: 'SELECT COUNT(*) as count FROM messages WHERE created_at > ? AND sender_id != ?',
                args: [since, userId]
              });
            } else {
              result = await db.execute({
                sql: 'SELECT COUNT(*) as count FROM messages WHERE sender_id != ?',
                args: [userId]
              });
            }
          }
          return res.json({ count: result.rows[0].count });
        }

        if (action === 'mentions-count') {
          let result;
          if (group_id) {
            result = await db.execute({
              sql: 'SELECT COUNT(*) as count FROM message_mentions mm JOIN messages i ON mm.message_id = i.id WHERE mm.mentioned_user_id = ? AND mm.seen = 0 AND i.group_id = ?',
              args: [userId, group_id]
            });
          } else {
            result = await db.execute({
              sql: 'SELECT COUNT(*) as count FROM message_mentions WHERE mentioned_user_id = ? AND seen = 0',
              args: [userId]
            });
          }
          return res.json({ count: result.rows[0].count });
        }

        return res.status(400).json({ error: 'Invalid action. Use: cooldown, new-count, mentions-count' });
      }

      if (req.method === 'POST') {
        const { action, group_id } = req.body;

        if (action === 'mark-seen') {
          if (group_id) {
            await db.execute({
              sql: `UPDATE message_mentions SET seen = 1
                    WHERE mentioned_user_id = ? AND seen = 0
                    AND message_id IN (
                      SELECT i.id FROM messages i
                      WHERE i.group_id = ?
                    )`,
              args: [userId, group_id]
            });
          } else {
            await db.execute({
              sql: 'UPDATE message_mentions SET seen = 1 WHERE mentioned_user_id = ? AND seen = 0',
              args: [userId]
            });
          }
          return res.json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid action. Use: mark-seen' });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // POST /api/chatroom/:id/action
    if (params[0] && params[1] === 'action') {
      const id = params[0];

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { action, user_id, vote, emoji } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      if (action === 'vote') {
        if (vote !== 1 && vote !== -1 && vote !== 0) {
          return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
        }

        const idea = await db.execute({
          sql: 'SELECT id FROM messages WHERE id = ?',
          args: [id]
        });
        if (idea.rows.length === 0) {
          return res.status(404).json({ error: 'Idea not found' });
        }

        const user = await db.execute({
          sql: 'SELECT id FROM people WHERE id = ?',
          args: [user_id]
        });
        if (user.rows.length === 0) {
          return res.status(400).json({ error: 'User not found' });
        }

        if (vote === 0) {
          await db.execute({
            sql: 'DELETE FROM message_votes WHERE message_id = ? AND user_id = ?',
            args: [id, user_id]
          });
        } else {
          await db.execute({
            sql: `
              INSERT INTO message_votes (message_id, user_id, vote)
              VALUES (?, ?, ?)
              ON CONFLICT(message_id, user_id) DO UPDATE SET vote = excluded.vote
            `,
            args: [id, user_id, vote]
          });
        }

        const counts = await db.execute({
          sql: `
            SELECT
              COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
              COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
            FROM message_votes
            WHERE message_id = ?
          `,
          args: [id]
        });

        return res.json({
          message_id: parseInt(id),
          upvotes: counts.rows[0].upvotes,
          downvotes: counts.rows[0].downvotes,
          userVote: vote
        });
      }

      if (action === 'react') {
        if (!emoji) {
          return res.status(400).json({ error: 'Emoji is required' });
        }

        const message = await db.execute({
          sql: 'SELECT id FROM messages WHERE id = ?',
          args: [id]
        });
        if (message.rows.length === 0) {
          return res.status(404).json({ error: 'Message not found' });
        }

        const user = await db.execute({
          sql: 'SELECT id FROM people WHERE id = ?',
          args: [user_id]
        });
        if (user.rows.length === 0) {
          return res.status(400).json({ error: 'User not found' });
        }

        const existing = await db.execute({
          sql: 'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
          args: [id, user_id, emoji]
        });

        if (existing.rows.length > 0) {
          await db.execute({
            sql: 'DELETE FROM message_reactions WHERE id = ?',
            args: [existing.rows[0].id]
          });
        } else {
          await db.execute({
            sql: 'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
            args: [id, user_id, emoji]
          });
        }

        const reactions = await db.execute({
          sql: `
            SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
            FROM message_reactions
            WHERE message_id = ?
            GROUP BY emoji
          `,
          args: [id]
        });

        return res.json({
          message_id: parseInt(id),
          reactions: reactions.rows.map(r => {
            const userIds = r.user_ids.split(',').map(Number);
            return {
              emoji: r.emoji,
              count: r.count,
              user_ids: userIds,
              reacted: userIds.includes(parseInt(user_id))
            };
          })
        });
      }

      return res.status(400).json({ error: 'Invalid action. Use: vote, react' });
    }

    // GET/POST /api/chatroom (no params)
    if (!params[0]) {
      if (req.method === 'GET') {
        const userId = req.query.userId;
        const groupId = req.query.group_id;
        let ideasQuery = `
          SELECT i.*, p.first_name as sender_first_name, p.last_name as sender_last_name,
            p.avatar as sender_avatar, p.is_system as sender_is_system,
            COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
            COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
          FROM messages i JOIN people p ON i.sender_id = p.id LEFT JOIN message_votes v ON i.id = v.message_id
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
            sql: 'SELECT message_id, vote FROM message_votes WHERE user_id = ?',
            args: [userId]
          });
          const voteMap = Object.fromEntries(userVotes.rows.map(v => [v.message_id, v.vote]));
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

        // Verify sender exists
        const sender = await db.execute({
          sql: 'SELECT id FROM people WHERE id = ?',
          args: [sender_id]
        });
        if (sender.rows.length === 0) {
          return res.status(400).json({ error: 'Sender not found' });
        }

        // Insert new message
        const insert = await db.execute({
          sql: 'INSERT INTO messages (sender_id, content, group_id) VALUES (?, ?, ?)',
          args: [sender_id, content.trim(), group_id || null]
        });

        const messageId = insert.lastInsertRowid;

        // Insert mentions if any (exclude self-mentions)
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

        // Return with sender info
        const message = await db.execute({
          sql: `
            SELECT
              i.*,
              p.first_name as sender_first_name,
              p.last_name as sender_last_name,
              p.avatar as sender_avatar
            FROM messages i
            JOIN people p ON i.sender_id = p.id
            WHERE i.id = ?
          `,
          args: [messageId]
        });

        return res.status(201).json(message.rows[0]);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
