import { useState, useEffect, useRef, useCallback } from 'react';
import EmojiPicker from './EmojiPicker';
import './ChatroomPanel.css';

const API_BASE = '/api';

function ChatroomPanel({ currentUser, people, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState({ canSend: true, remainingMs: 0 });
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const cooldownIntervalRef = useRef(null);
  const inputRef = useRef(null);
  const mentionMenuRef = useRef(null);
  const savedSelectionRef = useRef(null);

  // Build a map of user names to IDs for mention parsing
  const userNameMap = useRef({});
  useEffect(() => {
    const map = {};
    people.forEach(p => {
      const fullName = `${p.first_name} ${p.last_name}`;
      map[fullName.toLowerCase()] = p.id;
    });
    userNameMap.current = map;
  }, [people]);

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
      const res = await fetch(`${API_BASE}/chatroom/user/${currentUser.id}?action=cooldown`);
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

  // Auto-scroll to bottom only when message count changes (new message added)
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

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

  // Filter people for mention autocomplete
  const filteredPeople = mentionQuery
    ? people.filter(p => {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const query = mentionQuery.toLowerCase();
        return fullName.includes(query) || p.first_name.toLowerCase().includes(query);
      }).slice(0, 5)
    : people.slice(0, 5);

  // Get plain text content from contenteditable
  const getPlainText = () => {
    if (!inputRef.current) return '';
    let text = '';
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.classList?.contains('mention-chip')) {
        text += node.textContent;
      } else if (node.nodeName === 'BR') {
        text += '\n';
      } else {
        node.childNodes.forEach(walk);
      }
    };
    walk(inputRef.current);
    return text;
  };

  // Extract mentioned user IDs from DOM
  const extractMentionedIdsFromDOM = () => {
    if (!inputRef.current) return [];
    const chips = inputRef.current.querySelectorAll('.mention-chip');
    const ids = new Set();
    chips.forEach(chip => {
      const userId = chip.dataset.userId;
      if (userId) ids.add(parseInt(userId));
    });
    return Array.from(ids);
  };

  // Sync contenteditable to state
  const syncContent = () => {
    const text = getPlainText();
    setNewMessage(text);
    setMentionedUsers(extractMentionedIdsFromDOM());
  };

  // Handle input in contenteditable
  const handleInput = () => {
    syncContent();

    // Check for @ mention trigger
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent;
      const cursorPos = range.startOffset;
      const textBeforeCursor = text.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        const charBefore = lastAtIndex > 0 ? text[lastAtIndex - 1] : ' ';
        if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
          const query = textBeforeCursor.substring(lastAtIndex + 1);
          if (!query.includes(' ') || query.split(' ').length <= 2) {
            // Save selection for later use when clicking menu item
            savedSelectionRef.current = {
              textNode,
              cursorPos,
              lastAtIndex
            };
            setMentionQuery(query);
            setShowMentionMenu(true);
            setMentionIndex(0);
            return;
          }
        }
      }
    }

    setShowMentionMenu(false);
    setMentionQuery('');
    savedSelectionRef.current = null;
  };

  // Handle keydown in contenteditable
  const handleKeyDown = (e) => {
    // Handle mention menu navigation
    if (showMentionMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredPeople.length - 1));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredPeople.length > 0) {
          selectMention(filteredPeople[mentionIndex]);
        }
        return;
      } else if (e.key === 'Escape') {
        setShowMentionMenu(false);
        return;
      }
    }

    // Handle backspace/delete on mention chip
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      if (!range.collapsed) return; // Let default handle selection deletion

      const container = range.startContainer;
      const offset = range.startOffset;

      // Check if cursor is inside a mention chip
      const parentChip = container.parentElement?.closest('.mention-chip');
      if (parentChip) {
        e.preventDefault();
        parentChip.remove();
        syncContent();
        return;
      }

      if (e.key === 'Backspace') {
        // Helper to find previous mention chip, skipping empty text nodes
        const findPrevMentionChip = (node) => {
          let prev = node.previousSibling;
          while (prev) {
            if (prev.classList?.contains('mention-chip')) return prev;
            // Skip empty text nodes
            if (prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
              prev = prev.previousSibling;
              continue;
            }
            break;
          }
          return null;
        };

        // Check if cursor is at start of a node, previous sibling is mention
        if (offset === 0) {
          const prevChip = findPrevMentionChip(container);
          if (prevChip) {
            e.preventDefault();
            prevChip.remove();
            syncContent();
            return;
          }
        }

        // Check if cursor is right after whitespace that follows a mention
        // (e.g., cursor after the NBSP we insert after chips)
        if (container.nodeType === Node.TEXT_NODE && offset <= container.textContent.length) {
          const textBefore = container.textContent.substring(0, offset);
          // If only whitespace before cursor in this node, check previous sibling
          if (textBefore.trim() === '' && textBefore.length > 0) {
            const prevChip = findPrevMentionChip(container);
            if (prevChip) {
              e.preventDefault();
              // Remove the whitespace and the chip
              container.textContent = container.textContent.substring(offset);
              prevChip.remove();
              if (container.textContent === '') container.remove();
              syncContent();
              return;
            }
          }
        }
      }

      if (e.key === 'Delete') {
        // Check if next sibling is a mention chip
        if (container.nodeType === Node.TEXT_NODE && offset === container.textContent.length) {
          const next = container.nextSibling;
          if (next?.classList?.contains('mention-chip')) {
            e.preventDefault();
            next.remove();
            syncContent();
            return;
          }
        }
        // Check if at end of node and next is mention
        if (offset === 0 && container.nodeType !== Node.TEXT_NODE) {
          const next = container.nextSibling;
          if (next?.classList?.contains('mention-chip')) {
            e.preventDefault();
            next.remove();
            syncContent();
            return;
          }
        }
      }
    }

    // Handle Enter to submit (without mention menu)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Handle paste - strip HTML
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  // Select a user from mention menu
  const selectMention = (person) => {
    // Use saved selection since clicking menu loses focus
    const saved = savedSelectionRef.current;
    if (!saved || !saved.textNode || !saved.textNode.parentNode) return;

    const { textNode, cursorPos, lastAtIndex } = saved;
    const text = textNode.textContent;
    const fullName = `${person.first_name} ${person.last_name}`;

    // Create mention chip
    const chip = document.createElement('span');
    chip.className = 'mention-chip';
    chip.contentEditable = 'false';
    chip.dataset.userId = person.id;
    chip.textContent = `@${fullName}`;

    // Split text node and insert chip
    const beforeAt = text.substring(0, lastAtIndex);
    const afterCursor = text.substring(cursorPos);

    const spaceNode = document.createTextNode('\u00A0'); // non-breaking space after chip

    const parent = textNode.parentNode;

    // Only insert beforeNode if there's text before the @
    if (beforeAt) {
      const beforeNode = document.createTextNode(beforeAt);
      parent.insertBefore(beforeNode, textNode);
    }
    parent.insertBefore(chip, textNode);
    parent.insertBefore(spaceNode, textNode);
    if (afterCursor) {
      const afterNode = document.createTextNode(afterCursor);
      parent.insertBefore(afterNode, textNode);
    }
    parent.removeChild(textNode);

    // Set cursor after the space
    const selection = window.getSelection();
    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // Focus back on input
    inputRef.current?.focus();

    setShowMentionMenu(false);
    setMentionQuery('');
    savedSelectionRef.current = null;
    syncContent();
  };

  // Render message content with highlighted mentions
  const renderMessageContent = (content) => {
    const parts = [];
    const mentionPattern = /@([A-Za-zÀ-ÿ]+ [A-Za-zÀ-ÿ]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = mentionPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      const mentionName = match[1];
      const isMentioningMe = mentionName.toLowerCase() ===
        `${currentUser.first_name} ${currentUser.last_name}`.toLowerCase();
      parts.push(
        <span key={match.index} className={`mention ${isMentioningMe ? 'mention-me' : ''}`}>
          @{mentionName}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  // Submit new message
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const text = getPlainText().trim();
    if (!text || !cooldown.canSend) return;

    setSending(true);
    setError(null);

    const mentioned_ids = extractMentionedIdsFromDOM();

    try {
      const res = await fetch(`${API_BASE}/chatroom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUser.id,
          content: text,
          mentioned_ids
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
      // Clear input
      if (inputRef.current) {
        inputRef.current.innerHTML = '';
      }
      setNewMessage('');
      setMentionedUsers([]);
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

    const newVote = message.userVote === voteType ? 0 : voteType;

    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      let upvotes = m.upvotes;
      let downvotes = m.downvotes;

      if (m.userVote === 1) upvotes--;
      if (m.userVote === -1) downvotes--;

      if (newVote === 1) upvotes++;
      if (newVote === -1) downvotes++;

      return { ...m, userVote: newVote, upvotes, downvotes };
    }));

    try {
      const res = await fetch(`${API_BASE}/chatroom/${messageId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vote', user_id: currentUser.id, vote: newVote })
      });

      if (!res.ok) {
        throw new Error('Failed to vote');
      }

      const data = await res.json();
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, upvotes: data.upvotes, downvotes: data.downvotes, userVote: data.userVote }
          : m
      ));
    } catch (err) {
      fetchMessages();
      setError('Failed to vote');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle emoji reaction
  const handleReaction = async (messageId, emoji) => {
    // Close picker immediately
    setEmojiPickerMessageId(null);

    try {
      const res = await fetch(`${API_BASE}/chatroom/${messageId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'react', user_id: currentUser.id, emoji })
      });

      if (!res.ok) {
        throw new Error('Failed to react');
      }

      const data = await res.json();

      // Update message reactions in state
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, reactions: data.reactions }
          : m
      ));
    } catch (err) {
      setError('Failed to add reaction');
      setTimeout(() => setError(null), 3000);
    }
  };

  const isDisabled = !cooldown.canSend || sending;
  const placeholderText = cooldown.canSend ? "Send a message... (use @ to mention)" : "Wait for cooldown...";

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
          messages.map(message => {
            const isSystem = !!message.sender_is_system;
            return (
            <div
              key={message.id}
              className={`message-item ${message.sender_id === currentUser.id ? 'own' : ''} ${isSystem ? 'system-message' : ''}`}
            >
              <div className="message-avatar">
                {isSystem ? (
                  <div className="avatar-placeholder system-avatar">🤖</div>
                ) : message.sender_avatar ? (
                  <img src={message.sender_avatar} alt="" />
                ) : (
                  <div className="avatar-placeholder">
                    {message.sender_first_name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className={`message-sender ${isSystem ? 'system-sender' : ''}`}>
                    {message.sender_first_name} {message.sender_last_name}
                  </span>
                  <span className="message-time">{formatTime(message.created_at)}</span>
                </div>
                <p className="message-text">{renderMessageContent(message.content)}</p>
                {/* Reactions display - hidden for system messages */}
                {!isSystem && message.reactions && message.reactions.length > 0 && (
                  <div className="message-reactions">
                    {message.reactions.map(reaction => (
                      <button
                        key={reaction.emoji}
                        className={`reaction-badge ${reaction.reacted ? 'reacted' : ''}`}
                        onClick={() => handleReaction(message.id, reaction.emoji)}
                        title={`${reaction.count} ${reaction.count === 1 ? 'person' : 'people'} reacted`}
                      >
                        <span className="reaction-emoji">{reaction.emoji}</span>
                        <span className="reaction-count">{reaction.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {!isSystem && (
                <div className="message-actions">
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

                  <div className="reaction-picker-wrapper">
                    <button
                      className="reaction-btn"
                      onClick={() => setEmojiPickerMessageId(
                        emojiPickerMessageId === message.id ? null : message.id
                      )}
                      title="Add reaction"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6c.78 2.34 2.72 4 5 4s4.22-1.66 5-4H7zm8-4c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm-6 0c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z"/>
                      </svg>
                    </button>
                    {emojiPickerMessageId === message.id && (
                      <EmojiPicker
                        onSelect={(emoji) => handleReaction(message.id, emoji)}
                        onClose={() => setEmojiPickerMessageId(null)}
                        position="top"
                      />
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>
            );
          })
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
          <div className="textarea-wrapper">
            <div
              ref={inputRef}
              className={`message-input ${isDisabled ? 'disabled' : ''}`}
              contentEditable={!isDisabled}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              data-placeholder={placeholderText}
              suppressContentEditableWarning
            />
            {showMentionMenu && filteredPeople.length > 0 && (
              <div className="mention-menu" ref={mentionMenuRef} onMouseDown={e => e.preventDefault()}>
                {filteredPeople.map((person, idx) => (
                  <div
                    key={person.id}
                    className={`mention-item ${idx === mentionIndex ? 'selected' : ''}`}
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => selectMention(person)}
                  >
                    {person.avatar ? (
                      <img src={person.avatar} alt="" className="mention-avatar" />
                    ) : (
                      <div className="mention-avatar-placeholder">
                        {person.first_name.charAt(0)}
                      </div>
                    )}
                    <span>{person.first_name} {person.last_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isDisabled || !newMessage.trim()}
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
