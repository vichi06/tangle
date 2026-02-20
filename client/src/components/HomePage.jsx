import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateGroupModal from './CreateGroupModal';
import ConfirmModal from './ConfirmModal';
import { getJoinedGroups, addJoinedGroup, removeJoinedGroup } from '../utils/groups';
import './HomePage.css';

const API_BASE = '/api';

function HomePage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copied, setCopied] = useState(null);
  const [confirmLeaveCode, setConfirmLeaveCode] = useState(null);

  const fetchGroups = async () => {
    const joinedCodes = getJoinedGroups();
    if (joinedCodes.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }
    try {
      const results = await Promise.all(
        joinedCodes.map(async (code) => {
          try {
            const res = await fetch(`${API_BASE}/groups/${code}`);
            if (!res.ok) return null;
            return await res.json();
          } catch {
            return null;
          }
        })
      );
      setGroups(results.filter(Boolean));
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    const trimmed = joinCode.trim().toLowerCase();
    if (!trimmed) return;

    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`${API_BASE}/groups/${trimmed}`);
      if (!res.ok) {
        throw new Error('Group not found. Check the code and try again.');
      }
      const group = await res.json();
      addJoinedGroup(group.code);
      navigate(`/g/${group.code}`);
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveGroup = (code) => {
    removeJoinedGroup(code);
    setGroups(prev => prev.filter(g => g.code !== code));
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyLink = (code) => {
    const link = `${window.location.origin}/g/${code}`;
    navigator.clipboard.writeText(link);
    setCopied(`link-${code}`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleGroupCreated = (group) => {
    addJoinedGroup(group.code);
    setShowCreateModal(false);
    navigate(`/g/${group.code}`);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-container">
        <h1 className="home-title">Tangle</h1>
        {groups.length > 0 ? (
          <div className="group-grid">
            {groups.map(group => (
              <div key={group.code} className="group-card" onClick={() => navigate(`/g/${group.code}`)}>
                <div className="group-card-header">
                  <h3 className="group-card-name">{group.name}</h3>
                  <button
                    className="group-leave-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmLeaveCode(group.code);
                    }}
                    title="Leave group"
                  >
                    x
                  </button>
                </div>
                <p className="group-card-members">{group.member_count} {group.member_count === 1 ? 'member' : 'members'}</p>
                <div className="group-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="group-action-btn"
                    onClick={() => handleCopyCode(group.code)}
                    title="Copy group code"
                  >
                    {copied === group.code ? 'Copied!' : 'Copy Code'}
                  </button>
                  <button
                    className="group-action-btn"
                    onClick={() => handleCopyLink(group.code)}
                    title="Copy invite link"
                  >
                    {copied === `link-${group.code}` ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="home-empty">You haven't joined any groups yet</p>
        )}

        <div className="home-actions">
          <form className="join-form" onSubmit={handleJoinGroup}>
            <input
              type="text"
              placeholder="Enter group code..."
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value); setJoinError(null); }}
              className="join-input"
            />
            <button type="submit" className="join-btn" disabled={joining || !joinCode.trim()}>
              {joining ? 'Joining...' : 'Join'}
            </button>
          </form>
          {joinError && <p className="join-error">{joinError}</p>}

          <button className="create-group-btn" onClick={() => setShowCreateModal(true)}>
            + Create Group
          </button>
        </div>
      </div>

      {showCreateModal && (
        <CreateGroupModal
          onCreated={handleGroupCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {confirmLeaveCode && (
        <ConfirmModal
          message={`Leave "${groups.find(g => g.code === confirmLeaveCode)?.name}"? You can rejoin later with the group code.`}
          onConfirm={() => { handleLeaveGroup(confirmLeaveCode); setConfirmLeaveCode(null); }}
          onCancel={() => setConfirmLeaveCode(null)}
        />
      )}
    </div>
  );
}

export default HomePage;
