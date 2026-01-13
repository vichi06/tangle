import { useState, useEffect, useCallback } from 'react';
import Graph from './components/Graph';
import Tooltip from './components/Tooltip';
import UserPanel from './components/UserPanel';
import ChatroomPanel from './components/ChatroomPanel';
import WelcomeModal from './components/WelcomeModal';
import ProfileEdit from './components/ProfileEdit';
import './App.css';

const API_BASE = '/api';
const USER_COOKIE_NAME = 'tangle_user_id';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds
const CHATROOM_LAST_SEEN_KEY = 'tangle_chatroom_last_seen'; // localStorage key prefix

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
  const [showChatroomPanel, setShowChatroomPanel] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [newMentionsCount, setNewMentionsCount] = useState(0);

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

  // Sync currentUser with people array when data refreshes
  useEffect(() => {
    if (currentUser && people.length > 0) {
      const updatedUser = people.find(p => p.id === currentUser.id);
      if (updatedUser && JSON.stringify(updatedUser) !== JSON.stringify(currentUser)) {
        setCurrentUser(updatedUser);
      }
    }
  }, [people, currentUser]);

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

  // Get the localStorage key for the current user's last seen chatroom timestamp
  const getChatroomLastSeenKey = useCallback(() => {
    return currentUser ? `${CHATROOM_LAST_SEEN_KEY}_${currentUser.id}` : null;
  }, [currentUser]);

  // Fetch count of new messages since user's last visit
  const fetchNewMessagesCount = useCallback(async () => {
    if (!currentUser) return;

    const key = getChatroomLastSeenKey();
    const lastSeen = localStorage.getItem(key);

    try {
      const url = lastSeen
        ? `${API_BASE}/chatroom/new-count/${currentUser.id}?since=${encodeURIComponent(lastSeen)}`
        : `${API_BASE}/chatroom/new-count/${currentUser.id}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setNewMessagesCount(data.count);
      }
    } catch (err) {
      console.error('Failed to fetch new messages count:', err);
    }
  }, [currentUser, getChatroomLastSeenKey]);

  // Fetch count of unseen mentions
  const fetchNewMentionsCount = useCallback(async () => {
    if (!currentUser) return;

    try {
      const res = await fetch(`${API_BASE}/chatroom/mentions/count/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setNewMentionsCount(data.count);
      }
    } catch (err) {
      console.error('Failed to fetch mentions count:', err);
    }
  }, [currentUser]);

  // Fetch new messages and mentions count when user is set and periodically
  useEffect(() => {
    if (currentUser) {
      fetchNewMessagesCount();
      fetchNewMentionsCount();
      const interval = setInterval(() => {
        fetchNewMessagesCount();
        fetchNewMentionsCount();
      }, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [currentUser, fetchNewMessagesCount, fetchNewMentionsCount]);

  // Handle opening Chatroom panel - mark as seen
  const handleOpenChatroomPanel = async () => {
    if (!showChatroomPanel) {
      // Opening the panel - update last seen timestamp
      const key = getChatroomLastSeenKey();
      if (key) {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        localStorage.setItem(key, now);
        setNewMessagesCount(0);
      }
      // Mark mentions as seen
      if (currentUser && newMentionsCount > 0) {
        try {
          await fetch(`${API_BASE}/chatroom/mentions/mark-seen/${currentUser.id}`, {
            method: 'POST'
          });
          setNewMentionsCount(0);
        } catch (err) {
          console.error('Failed to mark mentions as seen:', err);
        }
      }
    }
    setShowChatroomPanel(!showChatroomPanel);
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
            className="panel-toggle chatroom-toggle"
            onClick={handleOpenChatroomPanel}
          >
            {showChatroomPanel ? 'Close' : 'Chatroom'}
            {!showChatroomPanel && newMentionsCount > 0 && (
              <span className="notification-badge mention-badge">@{newMentionsCount > 9 ? '9+' : newMentionsCount}</span>
            )}
            {!showChatroomPanel && newMessagesCount > 0 && (
              <span className="notification-badge">{newMessagesCount > 9 ? '9+' : newMessagesCount}</span>
            )}
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

      {showChatroomPanel && (
        <ChatroomPanel
          currentUser={currentUser}
          people={people}
          onClose={() => setShowChatroomPanel(false)}
        />
      )}

      {showProfileEdit && (
        <ProfileEdit
          user={currentUser}
          people={people}
          currentUser={currentUser}
          onUpdate={handleProfileUpdate}
          onClose={() => setShowProfileEdit(false)}
          onDelete={async (userId) => {
            const res = await fetch(`${API_BASE}/people/${userId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete profile');
            fetchData();
          }}
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
