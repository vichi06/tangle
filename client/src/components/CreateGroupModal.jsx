import { useState } from 'react';
import './CreateGroupModal.css';

const API_BASE = '/api';

function CreateGroupModal({ onCreated, onClose }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [createdGroup, setCreatedGroup] = useState(null);

  const isValid = name.trim().length >= 3 && name.trim().length <= 30 && /^[a-zA-Z0-9\s\-]+$/.test(name.trim());

  const handleCreate = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group');
      setCreatedGroup(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (createdGroup) {
      navigator.clipboard.writeText(createdGroup.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (createdGroup) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="create-group-modal" onClick={e => e.stopPropagation()}>
          <h2>Group Created!</h2>
          <p className="created-group-name">{createdGroup.name}</p>
          <p className="share-message">Share this code with others so they can join:</p>
          <div className={`code-display${copied ? ' copied' : ''}`} onClick={handleCopyCode} title="Click to copy">
            <code>{createdGroup.code}</code>
            <span className="copy-hint">{copied ? 'Copied!' : 'Click to copy'}</span>
          </div>
          <button className="continue-btn" onClick={() => onCreated(createdGroup)}>
            Continue to group
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-group-modal" onClick={e => e.stopPropagation()}>
        <h2>Create Group</h2>
        <input
          type="text"
          placeholder="Group name (3-30 characters)"
          value={name}
          onChange={e => { setName(e.target.value); setError(null); }}
          className="group-name-input"
          maxLength={30}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && isValid) handleCreate(); }}
        />
        <p className="name-hint">Letters, numbers, spaces, and hyphens only</p>
        {error && <p className="create-error">{error}</p>}
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="create-btn" onClick={handleCreate} disabled={loading || !isValid}>
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupModal;
