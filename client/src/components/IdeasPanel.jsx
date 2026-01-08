import { useState, useEffect, useRef, useCallback } from 'react';
import './IdeasPanel.css';

const API_BASE = '/api';

function IdeasPanel({ currentUser, onClose }) {
  const [ideas, setIdeas] = useState([]);
  const [newIdea, setNewIdea] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState({ canSend: true, remainingMs: 0 });
  const messagesEndRef = useRef(null);
  const cooldownIntervalRef = useRef(null);

  // Fetch all ideas with user's votes
  const fetchIdeas = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/ideas?userId=${currentUser.id}`);
      if (!res.ok) throw new Error('Failed to fetch ideas');
      const data = await res.json();
      setIdeas(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  // Check cooldown status
  const checkCooldown = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/ideas/cooldown/${currentUser.id}`);
      if (!res.ok) throw new Error('Failed to check cooldown');
      const data = await res.json();
      setCooldown(data);
    } catch (err) {
      console.error('Cooldown check failed:', err);
    }
  }, [currentUser.id]);

  // Initial load
  useEffect(() => {
    fetchIdeas();
    checkCooldown();
  }, [fetchIdeas, checkCooldown]);

  // Poll for new ideas every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchIdeas, 10000);
    return () => clearInterval(interval);
  }, [fetchIdeas]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown.remainingMs > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setCooldown(prev => {
          const newRemaining = Math.max(0, prev.remainingMs - 1000);
          return {
            canSend: newRemaining === 0,
            remainingMs: newRemaining
          };
        });
      }, 1000);
    }
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [cooldown.remainingMs > 0]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ideas]);

  // Format remaining time
  const formatCooldown = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp + 'Z');
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Submit new idea
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newIdea.trim() || !cooldown.canSend) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUser.id,
          content: newIdea.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setCooldown({ canSend: false, remainingMs: data.remainingMs });
        }
        throw new Error(data.error);
      }

      setIdeas(prev => [...prev, { ...data, upvotes: 0, downvotes: 0, userVote: 0 }]);
      setNewIdea('');
      setCooldown({ canSend: false, remainingMs: 30 * 60 * 1000 });
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setSending(false);
    }
  };

  // Handle vote
  const handleVote = async (ideaId, voteType) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;

    // If clicking same vote type, remove vote (toggle off)
    const newVote = idea.userVote === voteType ? 0 : voteType;

    // Optimistic update
    setIdeas(prev => prev.map(i => {
      if (i.id !== ideaId) return i;
      let upvotes = i.upvotes;
      let downvotes = i.downvotes;

      // Remove old vote
      if (i.userVote === 1) upvotes--;
      if (i.userVote === -1) downvotes--;

      // Add new vote
      if (newVote === 1) upvotes++;
      if (newVote === -1) downvotes++;

      return { ...i, userVote: newVote, upvotes, downvotes };
    }));

    try {
      const res = await fetch(`${API_BASE}/ideas/${ideaId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, vote: newVote })
      });

      if (!res.ok) {
        throw new Error('Failed to vote');
      }

      const data = await res.json();
      // Update with server response
      setIdeas(prev => prev.map(i =>
        i.id === ideaId
          ? { ...i, upvotes: data.upvotes, downvotes: data.downvotes, userVote: data.userVote }
          : i
      ));
    } catch (err) {
      // Revert on error
      fetchIdeas();
      setError('Failed to vote');
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <div className="ideas-panel">
      <div className="panel-header">
        <h2>Ideas</h2>
        <button className="close-btn" onClick={onClose}>x</button>
      </div>

      {error && (
        <div className="panel-message error">{error}</div>
      )}

      <div className="ideas-list">
        {loading ? (
          <div className="ideas-loading">Loading...</div>
        ) : ideas.length === 0 ? (
          <div className="no-ideas">No ideas yet. Be the first!</div>
        ) : (
          ideas.map(idea => (
            <div
              key={idea.id}
              className={`idea-item ${idea.sender_id === currentUser.id ? 'own' : ''}`}
            >
              <div className="idea-avatar">
                {idea.sender_avatar ? (
                  <img src={idea.sender_avatar} alt="" />
                ) : (
                  <div className="avatar-placeholder">
                    {idea.sender_first_name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="idea-content">
                <div className="idea-header">
                  <span className="idea-sender">
                    {idea.sender_first_name} {idea.sender_last_name}
                  </span>
                  <span className="idea-time">{formatTime(idea.created_at)}</span>
                </div>
                <p className="idea-text">{idea.content}</p>
                <div className="idea-votes">
                  <button
                    className={`vote-btn upvote ${idea.userVote === 1 ? 'active' : ''}`}
                    onClick={() => handleVote(idea.id, 1)}
                    title="Upvote"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M12 4l-8 8h5v8h6v-8h5z"/>
                    </svg>
                    {!!idea.upvotes && <span>{idea.upvotes}</span>}
                  </button>
                  <button
                    className={`vote-btn downvote ${idea.userVote === -1 ? 'active' : ''}`}
                    onClick={() => handleVote(idea.id, -1)}
                    title="Downvote"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M12 20l8-8h-5v-8h-6v8h-5z"/>
                    </svg>
                    {!!idea.downvotes && <span>{idea.downvotes}</span>}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="idea-form" onSubmit={handleSubmit}>
        {!cooldown.canSend && (
          <div className="cooldown-notice">
            Next idea in {formatCooldown(cooldown.remainingMs)}
          </div>
        )}
        <div className="idea-input-row">
          <textarea
            value={newIdea}
            onChange={(e) => setNewIdea(e.target.value)}
            placeholder={cooldown.canSend ? "Share an idea..." : "Wait for cooldown..."}
            disabled={!cooldown.canSend || sending}
            maxLength={500}
            rows={2}
          />
          <button
            type="submit"
            disabled={!cooldown.canSend || !newIdea.trim() || sending}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <div className="char-count">{newIdea.length}/500</div>
      </form>
    </div>
  );
}

export default IdeasPanel;
