import { useState, useEffect, useCallback } from 'react';
import Graph from './components/Graph';
import Tooltip from './components/Tooltip';
import UserPanel from './components/UserPanel';
import WelcomeModal from './components/WelcomeModal';
import ProfileEdit from './components/ProfileEdit';
import { useLanguage } from './i18n/LanguageContext';
import './App.css';

const API_BASE = '/api';

function App() {
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const { lang, setLang, t } = useLanguage();

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [peopleRes, relsRes] = await Promise.all([
        fetch(`${API_BASE}/people`),
        fetch(`${API_BASE}/relationships`)
      ]);

      if (!peopleRes.ok || !relsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const peopleData = await peopleRes.json();
      const relsData = await relsRes.json();

      setPeople(peopleData);
      setRelationships(relsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleShowTooltip = useCallback((data, position) => {
    setTooltip({ data, position });
  }, []);

  const handleHideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleSelectUser = (person) => {
    setCurrentUser(person);
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
    fetchData();
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p>{t('loading')}</p>
      </div>
    );
  }

  // Show welcome modal if no user selected
  if (!currentUser) {
    return (
      <WelcomeModal
        people={people}
        onSelect={handleSelectUser}
        onPersonAdded={fetchData}
      />
    );
  }

  return (
    <div className="app">
      <Graph
        people={people}
        relationships={relationships}
        currentUserId={currentUser.id}
        onShowTooltip={handleShowTooltip}
        onHideTooltip={handleHideTooltip}
      />

      {tooltip && (
        <Tooltip
          data={tooltip.data}
          position={tooltip.position}
          onClose={handleHideTooltip}
        />
      )}

      <div className="top-bar">
        <div className="top-bar-left">
          <div className="current-user" onClick={() => setShowProfileEdit(true)}>
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="" className="current-user-avatar" />
            ) : (
              <div className="current-user-avatar-placeholder">
                {currentUser.first_name.charAt(0)}
              </div>
            )}
            <span>{currentUser.first_name}</span>
            <span className="edit-hint">{t('edit')}</span>
          </div>
          <div className="lang-slider">
            <span className={lang === 'en' ? 'active' : ''}>EN</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={lang === 'fr'}
                onChange={(e) => setLang(e.target.checked ? 'fr' : 'en')}
              />
              <span className="slider"></span>
            </label>
            <span className={lang === 'fr' ? 'active' : ''}>FR</span>
          </div>
        </div>
        <button
          className="panel-toggle"
          onClick={() => setShowPanel(!showPanel)}
        >
          {showPanel ? t('close') : t('myKisses')}
        </button>
      </div>

      {showPanel && (
        <UserPanel
          currentUser={currentUser}
          people={people}
          relationships={relationships}
          onDataChange={fetchData}
          onClose={() => setShowPanel(false)}
        />
      )}

      {showProfileEdit && (
        <ProfileEdit
          user={currentUser}
          onUpdate={handleProfileUpdate}
          onClose={() => setShowProfileEdit(false)}
        />
      )}

      {error && (
        <div className="error-toast">
          {error}
          <button onClick={() => setError(null)}>{t('dismiss')}</button>
        </div>
      )}
    </div>
  );
}

export default App;
