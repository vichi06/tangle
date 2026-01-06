import { useState, useRef } from 'react';
import AvatarUpload from './AvatarUpload';
import './WelcomeModal.css';

const API_BASE = '/api';

function WelcomeModal({ people, onSelect, onPersonAdded }) {
  const [mode, setMode] = useState('select'); // 'select', 'create', 'admin-verify', or 'confirm'
  const [newPerson, setNewPerson] = useState({ first_name: '', last_name: '', bio: '', avatar: '', is_civ: false });
  const [pendingSelection, setPendingSelection] = useState(null);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const digitRefs = [useRef(), useRef(), useRef(), useRef()];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectPerson = (person) => {
    setPendingSelection(person);
    setError(null);
    if (person.is_admin) {
      setCodeDigits(['', '', '', '']);
      setMode('admin-verify');
      setTimeout(() => digitRefs[0].current?.focus(), 100);
    } else {
      setMode('confirm');
    }
  };

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...codeDigits];
    newDigits[index] = value.slice(-1);
    setCodeDigits(newDigits);

    // Auto-focus next input
    if (value && index < 3) {
      digitRefs[index + 1].current?.focus();
    }
  };

  const handleDigitKeyDown = (index, e) => {
    // Handle backspace - go to previous input
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      digitRefs[index - 1].current?.focus();
    }
  };

  const handleVerifyCode = async () => {
    const code = codeDigits.join('');
    if (code.length !== 4) {
      setError('Please enter a 4-digit code');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/people/${pendingSelection.id}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (!res.ok) {
        throw new Error('Invalid code');
      }
      setMode('confirm');
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const confirmSelection = () => {
    if (pendingSelection) {
      onSelect(pendingSelection);
    }
  };

  const cancelSelection = () => {
    setPendingSelection(null);
    setCodeDigits(['', '', '', '']);
    setError(null);
    setMode('select');
  };

  const handleCreate = async () => {
    if (!newPerson.first_name.trim() || !newPerson.last_name.trim()) {
      setError('First and last name are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPerson)
      });

      if (!res.ok) throw new Error('Failed to create profile');

      const person = await res.json();
      onPersonAdded();
      onSelect(person);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome-overlay">
      <div className="welcome-modal">
        <h1>Welcome to CIV Tangle</h1>
        <p className="welcome-subtitle">Who are you?</p>

        {mode === 'select' ? (
          <>
            {people.length > 0 ? (
              <div className="people-grid">
                {people.map(person => (
                  <button
                    key={person.id}
                    className="person-card"
                    onClick={() => handleSelectPerson(person)}
                  >
                    {person.avatar ? (
                      <img src={person.avatar} alt="" className="person-avatar" />
                    ) : (
                      <div className="person-avatar-placeholder">
                        {person.first_name.charAt(0)}
                      </div>
                    )}
                    <span className="person-name">
                      {person.first_name} {person.last_name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="no-people">No one here yet. Be the first!</p>
            )}

            <button
              className="switch-mode-btn"
              onClick={() => setMode('create')}
            >
              I'm not in the list - Add myself
            </button>
          </>
        ) : mode === 'admin-verify' && pendingSelection ? (
          <div className="confirm-selection">
            <div className="confirm-person">
              {pendingSelection.avatar ? (
                <img src={pendingSelection.avatar} alt="" className="confirm-avatar" />
              ) : (
                <div className="confirm-avatar-placeholder">
                  {pendingSelection.first_name.charAt(0)}
                </div>
              )}
              <span className="confirm-name">
                {pendingSelection.first_name} {pendingSelection.last_name}
              </span>
              <span className="admin-badge">Admin</span>
            </div>
            <p className="admin-verify-text">Enter your 4-digit code</p>
            <div className="code-digits">
              {codeDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={digitRefs[index]}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  className="code-digit-input"
                  value={digit}
                  onChange={e => handleDigitChange(index, e.target.value)}
                  onKeyDown={e => handleDigitKeyDown(index, e)}
                />
              ))}
            </div>
            {error && <p className="error-message">{error}</p>}
            <div className="confirm-actions">
              <button className="back-btn" onClick={cancelSelection}>
                Back
              </button>
              <button
                className="create-btn"
                onClick={handleVerifyCode}
                disabled={verifying || codeDigits.some(d => !d)}
              >
                {verifying ? 'Verifying...' : 'Continue'}
              </button>
            </div>
          </div>
        ) : mode === 'confirm' && pendingSelection ? (
          <div className="confirm-selection">
            <div className="confirm-person">
              {pendingSelection.avatar ? (
                <img src={pendingSelection.avatar} alt="" className="confirm-avatar" />
              ) : (
                <div className="confirm-avatar-placeholder">
                  {pendingSelection.first_name.charAt(0)}
                </div>
              )}
              <span className="confirm-name">
                {pendingSelection.first_name} {pendingSelection.last_name}
              </span>
            </div>
            <p className="confirm-warning">
              You won't be able to change your profile later.
            </p>
            <div className="confirm-actions">
              <button className="back-btn" onClick={cancelSelection}>
                Back
              </button>
              <button className="create-btn" onClick={confirmSelection}>
                Confirm
              </button>
            </div>
          </div>
        ) : (
          <div className="create-form">
            <div className="form-row">
              <input
                type="text"
                placeholder="First name"
                value={newPerson.first_name}
                onChange={e => setNewPerson(p => ({ ...p, first_name: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Last name"
                value={newPerson.last_name}
                onChange={e => setNewPerson(p => ({ ...p, last_name: e.target.value }))}
              />
            </div>

            <textarea
              placeholder="Bio (optional)"
              value={newPerson.bio}
              onChange={e => setNewPerson(p => ({ ...p, bio: e.target.value }))}
            />

            <div className="avatar-upload">
              <AvatarUpload
                value={newPerson.avatar}
                onChange={(avatar) => setNewPerson(prev => ({ ...prev, avatar }))}
                size={100}
              />
            </div>

            <button
              type="button"
              className={`civ-toggle-container ${newPerson.is_civ ? 'active' : ''}`}
              onClick={() => setNewPerson(p => ({ ...p, is_civ: !p.is_civ }))}
            >
              <span className="civ-toggle-label">Part of CIV</span>
              <span className="civ-toggle-track">
                <span className="civ-toggle-thumb" />
              </span>
            </button>

            {error && <p className="error-message">{error}</p>}

            <div className="form-actions">
              <button
                className="back-btn"
                onClick={() => setMode('select')}
              >
                Back
              </button>
              <button
                className="create-btn"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Join the graph'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WelcomeModal;
