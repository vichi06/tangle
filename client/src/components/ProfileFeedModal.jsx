import { useState, useEffect, useRef, useCallback } from 'react';
import './ProfileFeedModal.css';

const API_BASE = '/api';

const INTENSITY_COLORS = {
  kiss: '#ff6b6b',
  cuddle: '#ffaa55',
  couple: '#ff99cc',
  hidden: '#888888'
};

const INTENSITY_LABELS = {
  kiss: 'Kiss',
  cuddle: 'Cuddle',
  couple: 'Couple',
  hidden: 'Hidden'
};

function ProfileFeedModal({ profileId, currentUser, people, onClose, onRelationshipClick }) {
  const [profile, setProfile] = useState(null);
  const [relationships, setRelationships] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [expandedImage, setExpandedImage] = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const commentsEndRef = useRef(null);
  const inputRef = useRef(null);
  const mentionMenuRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Fetch profile data and comments
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/profile-feed/${profileId}?userId=${currentUser.id}`);
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      setProfile(data.profile);
      setComments(data.comments);
      setRelationships(data.relationships);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profileId, currentUser.id]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for new comments every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Auto-scroll to bottom when new comments added
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

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

  // Compress image for upload
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          reject(new Error('Image processing timed out'));
        }, 10000);

        img.onload = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxSize = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load image'));
        };
        img.src = readerEvent.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Handle image selection
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file);
      setPendingImage(compressed);
    } catch (err) {
      console.error('Image compression error:', err);
      setError('Failed to process image');
      setTimeout(() => setError(null), 3000);
    }
    e.target.value = '';
  };

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
    setNewComment(text);
  };

  // Handle input in contenteditable
  const handleInput = () => {
    syncContent();

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
            savedSelectionRef.current = { textNode, cursorPos, lastAtIndex };
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
      if (!range.collapsed) return;

      const container = range.startContainer;
      const offset = range.startOffset;

      const parentChip = container.parentElement?.closest('.mention-chip');
      if (parentChip) {
        e.preventDefault();
        parentChip.remove();
        syncContent();
        return;
      }

      if (e.key === 'Backspace') {
        const findPrevMentionChip = (node) => {
          let prev = node.previousSibling;
          while (prev) {
            if (prev.classList?.contains('mention-chip')) return prev;
            if (prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
              prev = prev.previousSibling;
              continue;
            }
            break;
          }
          return null;
        };

        if (offset === 0) {
          const prevChip = findPrevMentionChip(container);
          if (prevChip) {
            e.preventDefault();
            prevChip.remove();
            syncContent();
            return;
          }
        }

        if (container.nodeType === Node.TEXT_NODE && offset <= container.textContent.length) {
          const textBefore = container.textContent.substring(0, offset);
          if (textBefore.trim() === '' && textBefore.length > 0) {
            const prevChip = findPrevMentionChip(container);
            if (prevChip) {
              e.preventDefault();
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
        if (container.nodeType === Node.TEXT_NODE && offset === container.textContent.length) {
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
    const saved = savedSelectionRef.current;
    if (!saved || !saved.textNode || !saved.textNode.parentNode) return;

    const { textNode, cursorPos, lastAtIndex } = saved;
    const text = textNode.textContent;
    const fullName = `${person.first_name} ${person.last_name}`;

    const chip = document.createElement('span');
    chip.className = 'mention-chip';
    chip.contentEditable = 'false';
    chip.dataset.userId = person.id;
    chip.textContent = `@${fullName}`;

    const beforeAt = text.substring(0, lastAtIndex);
    const afterCursor = text.substring(cursorPos);
    const spaceNode = document.createTextNode('\u00A0');
    const parent = textNode.parentNode;

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

    const selection = window.getSelection();
    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    inputRef.current?.focus();
    setShowMentionMenu(false);
    setMentionQuery('');
    savedSelectionRef.current = null;
    syncContent();
  };

  // Render comment content with highlighted mentions
  const renderCommentContent = (content) => {
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

  // Submit new comment
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const text = getPlainText().trim();
    if (!text && !pendingImage) return;

    setSending(true);
    setError(null);

    const mentioned_ids = extractMentionedIdsFromDOM();

    try {
      const res = await fetch(`${API_BASE}/profile-feed/${profileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUser.id,
          content: text || ' ',
          image: pendingImage,
          mentioned_ids
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error);
      }

      setComments(prev => [...prev, { ...data, upvotes: 0, downvotes: 0, userVote: 0 }]);
      if (inputRef.current) {
        inputRef.current.innerHTML = '';
      }
      setNewComment('');
      setPendingImage(null);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setSending(false);
    }
  };

  // Handle vote
  const handleVote = async (commentId, voteType) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    const newVote = comment.userVote === voteType ? 0 : voteType;

    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      let upvotes = c.upvotes;
      let downvotes = c.downvotes;

      if (c.userVote === 1) upvotes--;
      if (c.userVote === -1) downvotes--;

      if (newVote === 1) upvotes++;
      if (newVote === -1) downvotes++;

      return { ...c, userVote: newVote, upvotes, downvotes };
    }));

    try {
      const res = await fetch(`${API_BASE}/profile-feed/${profileId}/${commentId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, vote: newVote })
      });

      if (!res.ok) {
        throw new Error('Failed to vote');
      }

      const data = await res.json();
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, upvotes: data.upvotes, downvotes: data.downvotes, userVote: data.userVote }
          : c
      ));
    } catch (err) {
      fetchData();
      setError('Failed to vote');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Get partner info from relationship
  const getPartner = (rel) => {
    const isFirst = rel.person1_id === profileId;
    return {
      id: isFirst ? rel.person2_id : rel.person1_id,
      firstName: isFirst ? rel.person2_first_name : rel.person1_first_name,
      lastName: isFirst ? rel.person2_last_name : rel.person1_last_name,
      avatar: isFirst ? rel.person2_avatar : rel.person1_avatar
    };
  };

  const isDisabled = sending;
  const placeholderText = "Add a comment... (use @ to mention)";

  if (loading) {
    return (
      <div className={`profile-feed-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
        <div className={`profile-feed-modal ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
          <div className="profile-feed-loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={`profile-feed-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
        <div className={`profile-feed-modal ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
          <div className="profile-feed-error">Profile not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`profile-feed-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`profile-feed-modal ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Header with profile info */}
        <div className="profile-feed-header">
          <div className="profile-feed-info">
            <div className="profile-feed-avatar-section">
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="profile-feed-avatar" />
              ) : (
                <div className="profile-feed-avatar-placeholder">
                  {profile.first_name.charAt(0)}
                </div>
              )}
            </div>
            <div className="profile-feed-details">
              <h2 className="profile-feed-name">
                {profile.first_name} {profile.last_name}
              </h2>
              {profile.bio && (
                <p className="profile-feed-bio">{profile.bio}</p>
              )}
            </div>
          </div>
          <button className="profile-feed-close-btn" onClick={handleClose}>×</button>
        </div>

        {/* Relationships section */}
        {relationships.length > 0 && (
          <div className="profile-feed-relationships">
            <h3 className="profile-feed-section-title">
              Relations ({relationships.length})
            </h3>
            <div className="profile-feed-relations-list">
              {relationships.map(rel => {
                const partner = getPartner(rel);
                return (
                  <div
                    key={rel.id}
                    className="profile-feed-relation-item"
                    onClick={() => onRelationshipClick && onRelationshipClick(rel)}
                  >
                    {partner.avatar ? (
                      <img src={partner.avatar} alt="" className="relation-avatar" />
                    ) : (
                      <div className="relation-avatar-placeholder">
                        {partner.firstName.charAt(0)}
                      </div>
                    )}
                    <span className="relation-name">{partner.firstName}</span>
                    <span
                      className="relation-intensity-dot"
                      style={{ backgroundColor: INTENSITY_COLORS[rel.intensity] }}
                      title={INTENSITY_LABELS[rel.intensity]}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="profile-feed-error-msg">{error}</div>
        )}

        {/* Comments section */}
        <div className="profile-feed-comments">
          <h3 className="profile-feed-section-title">
            Comments ({comments.length})
          </h3>
          {comments.length === 0 ? (
            <div className="profile-feed-empty">No comments yet. Be the first!</div>
          ) : (
            <div className="profile-feed-comments-list">
              {comments.map(comment => (
                <div
                  key={comment.id}
                  className={`profile-feed-comment ${comment.sender_id === currentUser.id ? 'own' : ''}`}
                >
                  <div className="profile-feed-comment-avatar">
                    {comment.sender_avatar ? (
                      <img src={comment.sender_avatar} alt="" />
                    ) : (
                      <div className="avatar-placeholder">
                        {comment.sender_first_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="profile-feed-comment-content">
                    <div className="profile-feed-comment-header">
                      <span className="profile-feed-comment-sender">
                        {comment.sender_first_name} {comment.sender_last_name}
                      </span>
                      <span className="profile-feed-comment-time">{formatTime(comment.created_at)}</span>
                    </div>
                    <p className="profile-feed-comment-text">{renderCommentContent(comment.content)}</p>
                    {comment.image && (
                      <img
                        src={comment.image}
                        alt=""
                        className="profile-feed-comment-image"
                        onClick={() => setExpandedImage(comment.image)}
                      />
                    )}
                    <div className="profile-feed-comment-votes">
                      <button
                        className={`vote-btn upvote ${comment.userVote === 1 ? 'active' : ''}`}
                        onClick={() => handleVote(comment.id, 1)}
                        title="Upvote"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M12 4l-8 8h5v8h6v-8h5z"/>
                        </svg>
                        {!!comment.upvotes && <span>{comment.upvotes}</span>}
                      </button>
                      <button
                        className={`vote-btn downvote ${comment.userVote === -1 ? 'active' : ''}`}
                        onClick={() => handleVote(comment.id, -1)}
                        title="Downvote"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M12 20l8-8h-5v-8h-6v8h-5z"/>
                        </svg>
                        {!!comment.downvotes && <span>{comment.downvotes}</span>}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>
          )}
        </div>

        {/* Comment form */}
        <form className="profile-feed-form" onSubmit={handleSubmit}>
          {pendingImage && (
            <div className="profile-feed-image-preview">
              <img src={pendingImage} alt="Preview" />
              <button
                type="button"
                className="profile-feed-image-remove"
                onClick={() => setPendingImage(null)}
              >
                ×
              </button>
            </div>
          )}

          <div className="profile-feed-input-row">
            <button
              type="button"
              className="profile-feed-image-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isDisabled}
              title="Add image"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
            </button>
            <div className="textarea-wrapper">
              <div
                ref={inputRef}
                className={`profile-feed-input ${isDisabled ? 'disabled' : ''}`}
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
              disabled={isDisabled || (!newComment.trim() && !pendingImage)}
            >
              {sending ? '...' : 'Post'}
            </button>
          </div>
          <div className="profile-feed-char-count">{newComment.length}/500</div>
        </form>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          hidden
        />
      </div>

      {expandedImage && (
        <div className="profile-feed-image-expanded" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="" />
        </div>
      )}
    </div>
  );
}

export default ProfileFeedModal;
