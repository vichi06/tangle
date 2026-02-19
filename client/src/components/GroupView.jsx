import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Graph from './Graph';
import Tooltip from './Tooltip';
import UserPanel from './UserPanel';
import ChatroomPanel from './ChatroomPanel';
import WelcomeModal from './WelcomeModal';
import ProfileEdit from './ProfileEdit';
import FeedModal from './FeedModal';
import InviteModal from './InviteModal';
import { getProfileCookie, setProfileCookie, addJoinedGroup } from '../utils/groups';

const API_BASE = '/api';
const CHATROOM_LAST_SEEN_KEY = 'tangle_chatroom_last_seen';
const GRAPH_POLL_INTERVAL = 10000;

function GroupView() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [groupLoading, setGroupLoading] = useState(true);
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
  const [chatroomMessages, setChatroomMessages] = useState([]);
  const [chatroomLoading, setChatroomLoading] = useState(true);
  const chatroomScrollRef = useRef(null);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [newMentionsCount, setNewMentionsCount] = useState(0);
  const [badgeKey, setBadgeKey] = useState(0);
  const [mentionBadgeKey, setMentionBadgeKey] = useState(0);
  const [pendingBadgeKey, setPendingBadgeKey] = useState(0);
  const [feedRelationship, setFeedRelationship] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState(null);

  // Fetch group info
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/groups/${code}`);
        if (!res.ok) {
          if (!cancelled) navigate('/', { replace: true });
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setGroup(data);
          addJoinedGroup(code);
        }
      } catch {
        if (!cancelled) navigate('/', { replace: true });
      } finally {
        if (!cancelled) setGroupLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code, navigate]);

  const groupId = group?.id;

  const fetchData = useCallback(async () => {
    if (!groupId) return;
    try {
      setError(null);
      const [peopleRes, relsRes] = await Promise.all([
        fetch(`${API_BASE}/people?group_id=${groupId}`),
        fetch(`${API_BASE}/relationships?group_id=${groupId}`)
      ]);
      if (!peopleRes.ok || !relsRes.ok) throw new Error('Failed to fetch data');
      const peopleData = await peopleRes.json();
      const relsData = await relsRes.json();
      setPeople(peopleData);
      setRelationships(relsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    fetchData();
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, GRAPH_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, groupId]);

  // Restore user from per-group profile cookie
  useEffect(() => {
    if (!loading && !userChecked && group) {
      const savedUserId = getProfileCookie(code);
      if (savedUserId && people.length > 0) {
        const savedUser = people.find(p => p.id === parseInt(savedUserId));
        if (savedUser) {
          setCurrentUser(savedUser);
        }
      }
      setUserChecked(true);
    }
  }, [loading, people, userChecked, code, group]);

  // Sync currentUser with people array
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
    setProfileCookie(code, person.id);
    setCurrentUser(person);
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
    fetchData();
  };

  const pendingRelCount = useMemo(() => {
    if (!currentUser) return 0;
    return relationships.filter(r =>
      r.is_pending && r.pending_by !== currentUser.id &&
      (r.person1_id === currentUser.id || r.person2_id === currentUser.id)
    ).length;
  }, [relationships, currentUser]);

  const prevPendingRef = useRef(0);
  useEffect(() => {
    if (pendingRelCount > prevPendingRef.current) {
      setPendingBadgeKey(k => k + 1);
    }
    prevPendingRef.current = pendingRelCount;
  }, [pendingRelCount]);

  const getChatroomLastSeenKey = useCallback(() => {
    return currentUser ? `${CHATROOM_LAST_SEEN_KEY}_${code}_${currentUser.id}` : null;
  }, [currentUser, code]);

  const fetchChatroomMessages = useCallback(async () => {
    if (!currentUser || !groupId) return;
    try {
      const res = await fetch(`${API_BASE}/chatroom?userId=${currentUser.id}&group_id=${groupId}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setChatroomMessages(data);
    } catch (err) {
      console.error('Failed to fetch chatroom messages:', err);
    } finally {
      setChatroomLoading(false);
    }
  }, [currentUser, groupId]);

  const fetchNewMessagesCount = useCallback(async () => {
    if (!currentUser || !groupId) return;
    const key = getChatroomLastSeenKey();
    const lastSeen = localStorage.getItem(key);
    try {
      let url = `${API_BASE}/chatroom/user/${currentUser.id}?action=new-count&group_id=${groupId}`;
      if (lastSeen) url += `&since=${encodeURIComponent(lastSeen)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setNewMessagesCount(prev => {
          if (data.count > prev) setBadgeKey(k => k + 1);
          return data.count;
        });
      }
    } catch (err) {
      console.error('Failed to fetch new messages count:', err);
    }
  }, [currentUser, getChatroomLastSeenKey, groupId]);

  const fetchNewMentionsCount = useCallback(async () => {
    if (!currentUser || !groupId) return;
    try {
      const res = await fetch(`${API_BASE}/chatroom/user/${currentUser.id}?action=mentions-count&group_id=${groupId}`);
      if (res.ok) {
        const data = await res.json();
        setNewMentionsCount(prev => {
          if (data.count > prev) setMentionBadgeKey(k => k + 1);
          return data.count;
        });
      }
    } catch (err) {
      console.error('Failed to fetch mentions count:', err);
    }
  }, [currentUser, groupId]);

  useEffect(() => {
    if (currentUser && groupId) {
      fetchChatroomMessages();
      fetchNewMessagesCount();
      fetchNewMentionsCount();
      const interval = setInterval(() => {
        fetchChatroomMessages();
        fetchNewMessagesCount();
        fetchNewMentionsCount();
      }, 20000);
      return () => clearInterval(interval);
    }
  }, [currentUser, groupId, fetchChatroomMessages, fetchNewMessagesCount, fetchNewMentionsCount]);

  const handleOpenChatroomPanel = async () => {
    if (!showChatroomPanel) {
      const key = getChatroomLastSeenKey();
      if (key) {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        localStorage.setItem(key, now);
        setNewMessagesCount(0);
      }
      if (currentUser && newMentionsCount > 0) {
        try {
          await fetch(`${API_BASE}/chatroom/user/${currentUser.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mark-seen' })
          });
          setNewMentionsCount(0);
        } catch (err) {
          console.error('Failed to mark mentions as seen:', err);
        }
      }
    }
    setShowChatroomPanel(!showChatroomPanel);
  };

  if (groupLoading || loading || !userChecked) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!group) return null;

  // Show welcome modal if no user selected
  if (!currentUser) {
    return (
      <WelcomeModal
        people={people}
        onSelect={handleSelectUser}
        onPersonAdded={fetchData}
        groupId={groupId}
        groupCode={code}
        groupName={group.name}
      />
    );
  }

  return (
    <div className="app">
      <Graph
        people={people}
        relationships={relationships}
        currentUserId={currentUser.id}
        tooltipData={tooltip}
        onShowTooltip={handleShowTooltip}
        onHideTooltip={handleHideTooltip}
        onOpenFeed={setFeedRelationship}
        onNodeClick={setSelectedProfileId}
        groupCode={code}
        groupName={group.name}
        groupCreatedBy={group.created_by}
        currentUser={currentUser}
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
              <span key={mentionBadgeKey} className="notification-badge mention-badge">@{newMentionsCount > 9 ? '9+' : newMentionsCount}</span>
            )}
            {!showChatroomPanel && newMessagesCount > 0 && (
              <span key={badgeKey} className="notification-badge">{newMessagesCount > 9 ? '9+' : newMessagesCount}</span>
            )}
          </button>
          <div className="top-bar-current-user" onClick={() => setShowProfileEdit(true)}>
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="" className="top-bar-current-user-avatar" />
            ) : (
              <div className="top-bar-current-user-avatar-placeholder">
                {currentUser.first_name.charAt(0)}
              </div>
            )}
            <span>{currentUser.first_name}</span>
            <span className="edit-hint">Edit</span>
          </div>
        </div>
        <div className="top-bar-right">
          <button
            className="panel-toggle home-toggle"
            onClick={() => navigate('/')}
            title="Back to groups"
          >
            Groups
          </button>
          <button
            className="panel-toggle kisses-toggle"
            onClick={() => setShowPanel(!showPanel)}
          >
            {showPanel ? 'Close' : 'My kisses'}
            {!showPanel && pendingRelCount > 0 && (
              <span key={pendingBadgeKey} className="notification-badge">{pendingRelCount > 9 ? '9+' : pendingRelCount}</span>
            )}
          </button>
        </div>
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
          messages={chatroomMessages}
          setMessages={setChatroomMessages}
          loading={chatroomLoading}
          savedScrollPos={chatroomScrollRef}
          onClose={() => setShowChatroomPanel(false)}
          groupId={groupId}
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

      {feedRelationship && (
        <FeedModal
          relationship={feedRelationship}
          currentUser={currentUser}
          people={people}
          onClose={() => setFeedRelationship(null)}
        />
      )}

      {!!selectedProfileId && (() => {
        const selectedPerson = people.find(p => p.id === selectedProfileId);
        if (selectedPerson && selectedPerson.is_pending) {
          return (
            <InviteModal
              person={selectedPerson}
              title={`${selectedPerson.first_name} hasn't joined yet`}
              description="Share this link so they can confirm their profile:"
              onClose={() => setSelectedProfileId(null)}
            />
          );
        }
        return null;
      })()}

      {error && (
        <div className="error-toast">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

export default GroupView;
