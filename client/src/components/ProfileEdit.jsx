import { useState, useMemo, useCallback } from 'react';
import AvatarUpload from './AvatarUpload';
import ConfirmModal from './ConfirmModal';
import './ProfileEdit.css';

const API_BASE = '/api';

function ProfileEdit({ user, people, currentUser, onUpdate, onClose, onDelete }) {
  // For admins, allow selecting which user to edit
  const [selectedUserId, setSelectedUserId] = useState(user.id);
  const isAdmin = !!currentUser?.is_admin;
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // The user being edited
  const editingUser = useMemo(() => {
    if (isAdmin && people) {
      return people.find(p => p.id === selectedUserId) || user;
    }
    return user;
  }, [isAdmin, people, selectedUserId, user]);

  const [profile, setProfile] = useState({
    first_name: editingUser.first_name,
    last_name: editingUser.last_name,
    bio: editingUser.bio || '',
    avatar: editingUser.avatar || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Update form when selected user changes
  const handleUserChange = (newUserId) => {
    setSelectedUserId(newUserId);
    const newUser = people.find(p => p.id === newUserId) || user;
    setProfile({
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      bio: newUser.bio || '',
      avatar: newUser.avatar || ''
    });
    setError(null);
  };

  const handleSave = async () => {
    if (!profile.first_name.trim() || !profile.last_name.trim()) {
      setError('First and last name are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/people/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });

      if (!res.ok) throw new Error('Failed to update profile');

      const updated = await res.json();
      onUpdate(updated);
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setLoading(true);
    try {
      await onDelete(editingUser.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Can delete only if editing someone else (not self)
  const canDelete = isAdmin && editingUser.id !== currentUser.id;

  return (
    <div className={`profile-edit-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`profile-edit-modal ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <h2>Edit Profile</h2>

        {isAdmin && people && (
          <div className="admin-user-selector">
            <select
              value={selectedUserId}
              onChange={e => handleUserChange(parseInt(e.target.value))}
            >
              {[...people]
                .sort((a, b) => {
                  const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
                  const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
                  return nameA.localeCompare(nameB);
                })
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} {p.id === currentUser.id ? '(You)' : ''}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="profile-avatar">
          <AvatarUpload
            value={profile.avatar}
            onChange={(avatar) => setProfile(prev => ({ ...prev, avatar }))}
            size={100}
          />
        </div>

        <div className="profile-form">
          <div className="name-row">
            <input
              type="text"
              placeholder="First name"
              value={profile.first_name}
              onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Last name"
              value={profile.last_name}
              onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))}
            />
          </div>

          <textarea
            placeholder="Bio (optional)"
            value={profile.bio}
            onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
          />

        </div>

        {error && <p className="profile-error">{error}</p>}

        <div className="profile-actions">
          <button className="cancel-btn" onClick={handleClose}>
            Cancel
          </button>
          <button className="save-btn" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>

        {canDelete && onDelete && (
          <button
            className="delete-profile-btn"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Profile
          </button>
        )}

        {showDeleteConfirm && (
          <ConfirmModal
            message={`Delete ${editingUser.first_name} ${editingUser.last_name}'s profile? This will remove them and all their connections.`}
            onConfirm={() => {
              setShowDeleteConfirm(false);
              handleDelete();
            }}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}

export default ProfileEdit;
