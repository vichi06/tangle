import db from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse route: /api/profile-feed/:profileId, /api/profile-feed/:profileId/:commentId/vote
  const params = req.query.params || [];
  const profileId = params[0];
  const commentId = params[1];
  const action = params[2]; // "vote"

  if (!profileId) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  try {
    // POST /api/profile-feed/:profileId/:commentId/vote
    if (commentId && action === 'vote') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { user_id, vote } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      if (vote !== 1 && vote !== -1 && vote !== 0) {
        return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
      }

      const comment = await db.execute({
        sql: 'SELECT id FROM profile_comments WHERE id = ?',
        args: [commentId]
      });
      if (comment.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
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
          sql: 'DELETE FROM profile_comment_votes WHERE comment_id = ? AND user_id = ?',
          args: [commentId, user_id]
        });
      } else {
        await db.execute({
          sql: `INSERT INTO profile_comment_votes (comment_id, user_id, vote)
                VALUES (?, ?, ?)
                ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = excluded.vote`,
          args: [commentId, user_id, vote]
        });
      }

      const counts = await db.execute({
        sql: `SELECT
                COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
                COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
              FROM profile_comment_votes
              WHERE comment_id = ?`,
        args: [commentId]
      });

      return res.json({
        comment_id: parseInt(commentId),
        upvotes: counts.rows[0].upvotes,
        downvotes: counts.rows[0].downvotes,
        userVote: vote
      });
    }

    // GET /api/profile-feed/:profileId
    if (req.method === 'GET') {
      const userId = req.query.userId;

      const profileResult = await db.execute({
        sql: 'SELECT id, first_name, last_name, avatar, bio FROM people WHERE id = ?',
        args: [profileId]
      });
      if (profileResult.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      const profile = profileResult.rows[0];

      const commentsResult = await db.execute({
        sql: `SELECT
                c.*,
                p.first_name as sender_first_name,
                p.last_name as sender_last_name,
                p.avatar as sender_avatar,
                COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
                COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
              FROM profile_comments c
              JOIN people p ON c.sender_id = p.id
              LEFT JOIN profile_comment_votes v ON c.id = v.comment_id
              WHERE c.profile_id = ?
              GROUP BY c.id
              ORDER BY c.created_at ASC`,
        args: [profileId]
      });

      let comments = commentsResult.rows;

      if (userId) {
        const userVotes = await db.execute({
          sql: 'SELECT comment_id, vote FROM profile_comment_votes WHERE user_id = ?',
          args: [userId]
        });
        const voteMap = Object.fromEntries(userVotes.rows.map(v => [v.comment_id, v.vote]));
        comments = comments.map(c => ({ ...c, userVote: voteMap[c.id] || 0 }));
      }

      const relationshipsResult = await db.execute({
        sql: `SELECT
                r.*,
                p1.first_name as person1_first_name, p1.last_name as person1_last_name, p1.avatar as person1_avatar,
                p2.first_name as person2_first_name, p2.last_name as person2_last_name, p2.avatar as person2_avatar
              FROM relationships r
              JOIN people p1 ON r.person1_id = p1.id
              JOIN people p2 ON r.person2_id = p2.id
              WHERE r.person1_id = ? OR r.person2_id = ?`,
        args: [profileId, profileId]
      });

      return res.json({ profile, comments, relationships: relationshipsResult.rows });
    }

    // POST /api/profile-feed/:profileId
    if (req.method === 'POST') {
      const { sender_id, content, image, mentioned_ids } = req.body;

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

      const profile = await db.execute({
        sql: 'SELECT id FROM people WHERE id = ?',
        args: [profileId]
      });
      if (profile.rows.length === 0) {
        return res.status(400).json({ error: 'Profile not found' });
      }

      const insert = await db.execute({
        sql: 'INSERT INTO profile_comments (profile_id, sender_id, content, image) VALUES (?, ?, ?, ?)',
        args: [profileId, sender_id, content.trim(), image || null]
      });
      const newCommentId = insert.lastInsertRowid;

      if (mentioned_ids && Array.isArray(mentioned_ids) && mentioned_ids.length > 0) {
        for (const userId of mentioned_ids) {
          if (userId !== sender_id) {
            await db.execute({
              sql: 'INSERT OR IGNORE INTO profile_comment_mentions (comment_id, mentioned_user_id) VALUES (?, ?)',
              args: [newCommentId, userId]
            });
          }
        }
      }

      const comment = await db.execute({
        sql: `SELECT c.*, p.first_name as sender_first_name, p.last_name as sender_last_name, p.avatar as sender_avatar
              FROM profile_comments c
              JOIN people p ON c.sender_id = p.id
              WHERE c.id = ?`,
        args: [newCommentId]
      });

      return res.status(201).json(comment.rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
