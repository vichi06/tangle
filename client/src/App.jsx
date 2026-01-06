import { useState, useEffect, useCallback } from 'react';
import Graph from './components/Graph';
import Tooltip from './components/Tooltip';
import UserPanel from './components/UserPanel';
import IdeasPanel from './components/IdeasPanel';
import WelcomeModal from './components/WelcomeModal';
import ProfileEdit from './components/ProfileEdit';
import './App.css';

const API_BASE = '/api';
const USER_COOKIE_NAME = 'tangle_user_id';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

// Cookie helpers
const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

const setCookie = (name, value, maxAge) => {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Strict`;
};

function App() {
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userChecked, setUserChecked] = useState(false);
  const [error, setError] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showIdeasPanel, setShowIdeasPanel] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

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

  // Restore user from cookie once data is loaded
  useEffect(() => {
    if (!loading && !userChecked) {
      const savedUserId = getCookie(USER_COOKIE_NAME);
      if (savedUserId && people.length > 0) {
        const savedUser = people.find(p => p.id === parseInt(savedUserId));
        if (savedUser) {
          setCurrentUser(savedUser);
        }
      }
      setUserChecked(true);
    }
  }, [loading, people, userChecked]);

  const handleShowTooltip = useCallback((data, position) => {
    setTooltip({ data, position });
  }, []);

  const handleHideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleSelectUser = (person) => {
    setCookie(USER_COOKIE_NAME, person.id, COOKIE_MAX_AGE);
    setCurrentUser(person);
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
    fetchData();
  };

  if (loading || !userChecked) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
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
        onRefresh={fetchData}
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
          <button
            className="panel-toggle ideas-toggle"
            onClick={() => setShowIdeasPanel(!showIdeasPanel)}
          >
            {showIdeasPanel ? 'Close' : 'Ideas'}
          </button>
          <div className="current-user" onClick={() => setShowProfileEdit(true)}>
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="" className="current-user-avatar" />
            ) : (
              <div className="current-user-avatar-placeholder">
                {currentUser.first_name.charAt(0)}
              </div>
            )}
            <span>{currentUser.first_name}</span>
            <span className="edit-hint">Edit</span>
          </div>
        </div>
        <button
          className="panel-toggle"
          onClick={() => setShowPanel(!showPanel)}
        >
          {showPanel ? 'Close' : 'My kisses'}
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

      {showIdeasPanel && (
        <IdeasPanel
          currentUser={currentUser}
          onClose={() => setShowIdeasPanel(false)}
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
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

export default App;
