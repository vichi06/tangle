import { useState, useEffect, useRef, useCallback } from 'react';
import './ChatroomPanel.css';

const API_BASE = '/api';

function ChatroomPanel({ currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState({ canSend: true, remainingMs: 0 });
  const messagesEndRef = useRef(null);
  const cooldownIntervalRef = useRef(null);

  // Fetch all messages with user's votes
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chatroom?userId=${currentUser.id}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  // Check cooldown status
  const checkCooldown = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chatroom/cooldown/${currentUser.id}`);
      if (!res.ok) throw new Error('Failed to check cooldown');
      const data = await res.json();
      setCooldown(data);
    } catch (err) {
      console.error('Cooldown check failed:', err);
    }
  }, [currentUser.id]);

  // Initial load
  useEffect(() => {
    fetchMessages();
    checkCooldown();
  }, [fetchMessages, checkCooldown]);

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

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
  }, [messages]);

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

  // Submit new message
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !cooldown.canSend) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/chatroom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUser.id,
          content: newMessage.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setCooldown({ canSend: false, remainingMs: data.remainingMs });
        }
        throw new Error(data.error);
      }

      setMessages(prev => [...prev, { ...data, upvotes: 0, downvotes: 0, userVote: 0 }]);
      setNewMessage('');
      setCooldown({ canSend: false, remainingMs: 30 * 60 * 1000 });
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setSending(false);
    }
  };

  // Handle vote
  const handleVote = async (messageId, voteType) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    // If clicking same vote type, remove vote (toggle off)
    const newVote = message.userVote === voteType ? 0 : voteType;

    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      let upvotes = m.upvotes;
      let downvotes = m.downvotes;

      // Remove old vote
      if (m.userVote === 1) upvotes--;
      if (m.userVote === -1) downvotes--;

      // Add new vote
      if (newVote === 1) upvotes++;
      if (newVote === -1) downvotes++;

      return { ...m, userVote: newVote, upvotes, downvotes };
    }));

    try {
      const res = await fetch(`${API_BASE}/chatroom/${messageId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, vote: newVote })
      });

      if (!res.ok) {
        throw new Error('Failed to vote');
      }

      const data = await res.json();
      // Update with server response
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, upvotes: data.upvotes, downvotes: data.downvotes, userVote: data.userVote }
          : m
      ));
    } catch (err) {
      // Revert on error
      fetchMessages();
      setError('Failed to vote');
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <div className="chatroom-panel">
      <div className="panel-header">
        <h2>Chatroom</h2>
        <button className="close-btn" onClick={onClose}>x</button>
      </div>

      {error && (
        <div className="panel-message error">{error}</div>
      )}

      <div className="chatroom-list">
        {loading ? (
          <div className="chatroom-loading">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">No messages yet. Be the first!</div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`message-item ${message.sender_id === currentUser.id ? 'own' : ''}`}
            >
              <div className="message-avatar">
                {message.sender_avatar ? (
                  <img src={message.sender_avatar} alt="" />
                ) : (
                  <div className="avatar-placeholder">
                    {message.sender_first_name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-sender">
                    {message.sender_first_name} {message.sender_last_name}
                  </span>
                  <span className="message-time">{formatTime(message.created_at)}</span>
                </div>
                <p className="message-text">{message.content}</p>
                <div className="message-votes">
                  <button
                    className={`vote-btn upvote ${message.userVote === 1 ? 'active' : ''}`}
                    onClick={() => handleVote(message.id, 1)}
                    title="Upvote"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M12 4l-8 8h5v8h6v-8h5z"/>
                    </svg>
                    {!!message.upvotes && <span>{message.upvotes}</span>}
                  </button>
                  <button
                    className={`vote-btn downvote ${message.userVote === -1 ? 'active' : ''}`}
                    onClick={() => handleVote(message.id, -1)}
                    title="Downvote"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M12 20l8-8h-5v-8h-6v8h-5z"/>
                    </svg>
                    {!!message.downvotes && <span>{message.downvotes}</span>}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-form" onSubmit={handleSubmit}>
        {!cooldown.canSend && (
          <div className="cooldown-notice">
            Next message in {formatCooldown(cooldown.remainingMs)}
          </div>
        )}
        <div className="message-input-row">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={cooldown.canSend ? "Send a message..." : "Wait for cooldown..."}
            disabled={!cooldown.canSend || sending}
            maxLength={500}
            rows={2}
          />
          <button
            type="submit"
            disabled={!cooldown.canSend || !newMessage.trim() || sending}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <div className="char-count">{newMessage.length}/500</div>
      </form>
    </div>
  );
}

export default ChatroomPanel;
