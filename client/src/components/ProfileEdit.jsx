import { useState } from 'react';
import AvatarUpload from './AvatarUpload';
import ConfirmModal from './ConfirmModal';
import './ProfileEdit.css';

const API_BASE = '/api';

function ProfileEdit({ user, onUpdate, onClose, onDelete }) {
  const [profile, setProfile] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    bio: user.bio || '',
    avatar: user.avatar || '',
    is_external: !!user.is_external
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSave = async () => {
    if (!profile.first_name.trim() || !profile.last_name.trim()) {
      setError('First and last name are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/people/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });

      if (!res.ok) throw new Error('Failed to update profile');

      const updated = await res.json();
      onUpdate(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-edit-overlay" onClick={onClose}>
      <div className="profile-edit-modal" onClick={e => e.stopPropagation()}>
        <h2>Edit Profile</h2>

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

          <label className="external-checkbox">
            <input
              type="checkbox"
              checked={profile.is_external}
              onChange={e => setProfile(p => ({ ...p, is_external: e.target.checked }))}
            />
            <span>External to the group</span>
          </label>
        </div>

        {error && <p className="profile-error">{error}</p>}

        <div className="profile-actions">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="save-btn" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>

        {onDelete && (
          <button
            className="delete-profile-btn"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Profile
          </button>
        )}

        {showDeleteConfirm && (
          <ConfirmModal
            message={`Delete ${user.first_name} ${user.last_name}'s profile? This will remove them and all their connections.`}
            onConfirm={() => {
              setShowDeleteConfirm(false);
              onDelete();
            }}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}

export default ProfileEdit;
