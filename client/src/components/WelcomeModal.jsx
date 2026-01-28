import { useState, useRef } from 'react';
import AvatarUpload from './AvatarUpload';
import './WelcomeModal.css';

const API_BASE = '/api';

function WelcomeModal({ people, onSelect, onPersonAdded }) {
  const [mode, setMode] = useState('select'); // 'select', 'create', 'admin-verify', or 'confirm'
  const [newPerson, setNewPerson] = useState({ first_name: '', last_name: '', bio: '', avatar: '', is_external: false });
  const [pendingSelection, setPendingSelection] = useState(null);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const digitRefs = [useRef(), useRef(), useRef(), useRef()];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPeople = people
    .filter(person => {
      if (!searchQuery.trim()) return true;
      const fullName = `${person.first_name} ${person.last_name}`.toLowerCase();
      return fullName.includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

  // Check if search returned no results
  const noSearchResults = searchQuery.trim() && filteredPeople.length === 0;

  // Parse search query into first/last name
  const parseSearchQuery = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return { first_name: '', last_name: '' };

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return { first_name: parts[0], last_name: '' };
    }
    // First word is first name, rest is last name
    return {
      first_name: parts[0],
      last_name: parts.slice(1).join(' ')
    };
  };

  const handleSwitchToCreate = () => {
    if (noSearchResults) {
      const parsed = parseSearchQuery();
      setNewPerson(p => ({ ...p, first_name: parsed.first_name, last_name: parsed.last_name }));
    }
    setMode('create');
  };

  const handleSelectPerson = (person) => {
    setPendingSelection(person);
    setError(null);
    if (person.is_admin) {
      setCodeDigits(['', '', '', '']);
      setMode('admin-verify');
      setTimeout(() => digitRefs[0].current?.focus(), 100);
    } else if (person.is_pending) {
      setMode('pending-confirm');
    } else {
      setMode('confirm');
    }
  };

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...codeDigits];
    newDigits[index] = value.slice(-1);
    setCodeDigits(newDigits);

    // Auto-focus next input or auto-submit
    if (value && index < 3) {
      digitRefs[index + 1].current?.focus();
    } else if (value && index === 3 && newDigits.every(d => d)) {
      verifyCode(newDigits.join(''));
    }
  };

  const handleDigitKeyDown = (index, e) => {
    // Handle backspace - go to previous input
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      digitRefs[index - 1].current?.focus();
    }
  };

  const verifyCode = async (code) => {
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

  const handleVerifyCode = () => {
    verifyCode(codeDigits.join(''));
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
            {people.length > 0 && (
              <div className="search-bar">
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            )}
            {filteredPeople.length > 0 ? (
              <div className="people-grid">
                {filteredPeople.map(person => (
                  <button
                    key={person.id}
                    className={`person-card ${person.is_pending ? 'pending' : ''}`}
                    onClick={() => handleSelectPerson(person)}
                  >
                    {person.avatar ? (
                      <img
                        src={person.avatar}
                        alt=""
                        className={`person-avatar ${person.is_pending ? 'pending' : ''}`}
                      />
                    ) : (
                      <div className={`person-avatar-placeholder ${person.is_pending ? 'pending' : ''}`}>
                        {person.first_name.charAt(0)}
                      </div>
                    )}
                    <span className="person-name">
                      {person.first_name} {person.last_name}
                    </span>
                    {!!person.is_pending && <span className="pending-badge">Pending</span>}
                  </button>
                ))}
              </div>
            ) : people.length > 0 ? (
              <p className="no-people">No results found</p>
            ) : (
              <p className="no-people">No one here yet. Be the first!</p>
            )}

            {noSearchResults && (
              <button
                className="switch-mode-btn"
                onClick={handleSwitchToCreate}
              >
                You're not a Tangler yet?
              </button>
            )}
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
        ) : mode === 'pending-confirm' && pendingSelection ? (
          <div className="confirm-selection pending-confirm">
            <div className="confirm-person">
              {pendingSelection.avatar ? (
                <img src={pendingSelection.avatar} alt="" className="confirm-avatar pending" />
              ) : (
                <div className="confirm-avatar-placeholder pending">
                  {pendingSelection.first_name.charAt(0)}
                </div>
              )}
              <span className="confirm-name">
                {pendingSelection.first_name} {pendingSelection.last_name}
              </span>
              <span className="pending-badge">Pending Profile</span>
            </div>
            <p className="pending-explain">
              Someone added you to the graph. Review your relationships and confirm your profile to activate it.
            </p>
            <div className="confirm-actions">
              <button className="back-btn" onClick={cancelSelection}>
                Back
              </button>
              <button className="create-btn" onClick={confirmSelection}>
                Continue
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

            <label className="external-checkbox">
              <input
                type="checkbox"
                checked={newPerson.is_external}
                onChange={e => setNewPerson(p => ({ ...p, is_external: e.target.checked }))}
              />
              <span>External to the group</span>
            </label>

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
