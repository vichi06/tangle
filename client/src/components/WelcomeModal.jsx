import { useState } from 'react';
import AvatarUpload from './AvatarUpload';
import { useLanguage } from '../i18n/LanguageContext';
import './WelcomeModal.css';

const API_BASE = '/api';

function WelcomeModal({ people, onSelect, onPersonAdded }) {
  const [mode, setMode] = useState('select'); // 'select' or 'create'
  const [newPerson, setNewPerson] = useState({ first_name: '', last_name: '', bio: '', avatar: '', is_civ: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useLanguage();


  const handleCreate = async () => {
    if (!newPerson.first_name.trim() || !newPerson.last_name.trim()) {
      setError(t('firstLastRequired'));
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

      if (!res.ok) throw new Error(t('failedCreate'));

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
        <h1>{t('welcomeTitle')}</h1>
        <p className="welcome-subtitle">{t('welcomeSubtitle')}</p>

        {mode === 'select' ? (
          <>
            {people.length > 0 ? (
              <div className="people-grid">
                {people.map(person => (
                  <button
                    key={person.id}
                    className="person-card"
                    onClick={() => onSelect(person)}
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
              <p className="no-people">{t('noOneYet')}</p>
            )}

            <button
              className="switch-mode-btn"
              onClick={() => setMode('create')}
            >
              {t('notInList')}
            </button>
          </>
        ) : (
          <div className="create-form">
            <div className="form-row">
              <input
                type="text"
                placeholder={t('firstName')}
                value={newPerson.first_name}
                onChange={e => setNewPerson(p => ({ ...p, first_name: e.target.value }))}
              />
              <input
                type="text"
                placeholder={t('lastName')}
                value={newPerson.last_name}
                onChange={e => setNewPerson(p => ({ ...p, last_name: e.target.value }))}
              />
            </div>

            <textarea
              placeholder={t('bioOptional')}
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
              <span className="civ-toggle-label">{t('partOfCiv')}</span>
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
                {t('back')}
              </button>
              <button
                className="create-btn"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? t('creating') : t('joinGraph')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WelcomeModal;
