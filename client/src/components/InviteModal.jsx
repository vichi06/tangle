import { useState } from 'react';
import './InviteModal.css';

function InviteModal({ person, onClose, title, description }) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}?invite=${person.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = inviteUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="invite-overlay" onClick={onClose}>
      <div className="invite-modal" onClick={e => e.stopPropagation()}>
        <p className="invite-title">
          {title || `Added ${person.first_name} and linked!`}
        </p>

        <div className="invite-person">
          {person.avatar ? (
            <img src={person.avatar} alt="" className="invite-avatar" />
          ) : (
            <div className="invite-avatar-placeholder">
              {person.first_name.charAt(0)}
            </div>
          )}
          <span className="invite-name">
            {person.first_name} {person.last_name}
          </span>
        </div>

        <p className="invite-description">
          {description || 'Share this link so they can confirm their profile:'}
        </p>

        <div className="invite-link-row">
          <input
            type="text"
            className="invite-link-input"
            value={inviteUrl}
            readOnly
            onFocus={e => e.target.select()}
          />
          <button className="invite-copy-btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <button className="invite-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default InviteModal;
