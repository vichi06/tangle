import { useState, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';
import InviteModal from './InviteModal';
import DatePicker from './DatePicker';
import { formatDateForDisplay } from '../utils/dateUtils';
import './UserPanel.css';

const API_BASE = '/api';

const INTENSITY_OPTIONS = [
  { value: 'kiss', label: 'Kiss' },
  { value: 'cuddle', label: 'Cuddle in bed' },
  { value: 'couple', label: 'Couple' },
  { value: 'hidden', label: 'Hidden' }
];

const INTENSITY_LABELS = {
  kiss: 'Kiss',
  cuddle: 'Cuddle in bed',
  couple: 'Couple',
  hidden: 'Hidden'
};

function UserPanel({ currentUser, people, relationships, onDataChange, onClose }) {
  const [mode, setMode] = useState('list'); // 'list', 'add', 'create', 'edit'
  const [managedUserId, setManagedUserId] = useState(currentUser.id);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [newRelation, setNewRelation] = useState({ intensity: 'kiss', date: '', context: '' });
  const [newPerson, setNewPerson] = useState({ first_name: '', last_name: '', bio: '', avatar: '' });
  const [editingRelation, setEditingRelation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false);
  const [invitePerson, setInvitePerson] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // The user whose relationships we're managing (admin can change this)
  const managedUser = useMemo(() => {
    return people.find(p => p.id === managedUserId) || currentUser;
  }, [people, managedUserId, currentUser]);

  // Get managed user's relationships (sorted by intensity: kiss < cuddle < couple)
  const myRelationships = useMemo(() => {
    const intensityOrder = { kiss: 0, cuddle: 1, couple: 2, hidden: 3 };
    return relationships.filter(
      rel => rel.person1_id === managedUser.id || rel.person2_id === managedUser.id
    ).map(rel => {
      const isFirst = rel.person1_id === managedUser.id;
      return {
        ...rel,
        partnerId: isFirst ? rel.person2_id : rel.person1_id,
        partnerFirstName: isFirst ? rel.person2_first_name : rel.person1_first_name,
        partnerLastName: isFirst ? rel.person2_last_name : rel.person1_last_name,
        partnerAvatar: isFirst ? rel.person2_avatar : rel.person1_avatar
      };
    }).sort((a, b) => (intensityOrder[a.intensity] ?? 0) - (intensityOrder[b.intensity] ?? 0));
  }, [relationships, managedUser.id]);

  // Split into accepted, pending incoming, and pending outgoing
  const acceptedRelationships = useMemo(() =>
    myRelationships.filter(r => !r.is_pending),
    [myRelationships]
  );

  const pendingIncoming = useMemo(() =>
    myRelationships.filter(r => r.is_pending && r.pending_by !== managedUser.id),
    [myRelationships, managedUser.id]
  );

  const pendingOutgoing = useMemo(() =>
    myRelationships.filter(r => r.is_pending && r.pending_by === managedUser.id),
    [myRelationships, managedUser.id]
  );

  // People not yet connected to managed user
  const availablePeople = useMemo(() => {
    const connectedIds = new Set(myRelationships.map(r => r.partnerId));
    connectedIds.add(managedUser.id);
    return people.filter(p => !connectedIds.has(p.id));
  }, [people, myRelationships, managedUser.id]);

  const filteredPeople = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return availablePeople.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
    );
  }, [availablePeople, searchQuery]);

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 3000);
  };


  const addRelationship = async (personId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person1_id: managedUser.id,
          person2_id: personId,
          intensity: newRelation.intensity,
          date: newRelation.date || null,
          context: newRelation.context || null,
          requester_id: managedUser.id
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add relationship');
      }

      setNewRelation({ intensity: 'kiss', date: '', context: '' });
      setSelectedPersonId('');
      setMode('list');
      onDataChange();
      showMessage('Relationship request sent');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const createPersonAndRelationship = async () => {
    if (!newPerson.first_name.trim() || !newPerson.last_name.trim()) {
      showMessage('First and last name are required', true);
      return;
    }

    setLoading(true);
    try {
      // Create the new person (marked as pending until they log in and confirm)
      const personRes = await fetch(`${API_BASE}/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPerson, is_pending: true })
      });

      if (!personRes.ok) throw new Error('Failed to create person');
      const createdPerson = await personRes.json();

      // Create the relationship
      const relRes = await fetch(`${API_BASE}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person1_id: managedUser.id,
          person2_id: createdPerson.id,
          intensity: newRelation.intensity,
          date: newRelation.date || null,
          context: newRelation.context || null,
          requester_id: managedUser.id
        })
      });

      if (!relRes.ok) throw new Error('Failed to create relationship');

      setNewPerson({ first_name: '', last_name: '', bio: '', avatar: '' });
      setNewRelation({ intensity: 'kiss', date: '', context: '' });
      setMode('list');
      onDataChange();
      setInvitePerson(createdPerson);
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const deleteRelationship = async (relId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/relationships/${relId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');

      onDataChange();
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  const acceptRelationship = async (relId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/relationships/${relId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: managedUser.id })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to accept');
      }
      onDataChange();
      showMessage('Relationship accepted');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const declineRelationship = async (relId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/relationships/${relId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to decline');
      onDataChange();
      showMessage('Relationship declined');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const startEditRelation = (rel) => {
    setEditingRelation({
      id: rel.id,
      partnerFirstName: rel.partnerFirstName,
      partnerLastName: rel.partnerLastName,
      intensity: rel.intensity || 'kiss',
      date: rel.date || '',
      context: rel.context || ''
    });
    setMode('edit');
  };

  const updateRelationship = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/relationships/${editingRelation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intensity: editingRelation.intensity,
          date: editingRelation.date || null,
          context: editingRelation.context || null
        })
      });

      if (!res.ok) throw new Error('Failed to update');

      setEditingRelation(null);
      setMode('list');
      onDataChange();
      showMessage('Relationship updated');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const deleteProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/people/${managedUser.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete profile');
      // Reset to current user if we deleted someone else
      setManagedUserId(currentUser.id);
      setConfirmDeleteProfile(false);
      onDataChange();
      showMessage(`${managedUser.first_name}'s profile deleted`);
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const IntensityRadios = ({ value, onChange }) => (
    <div className="intensity-options">
      {INTENSITY_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`intensity-option ${value === opt.value ? 'selected' : ''}`}
          data-intensity={opt.value}
          onClick={() => onChange(opt.value)}
        >
          <span className={`intensity-dot intensity-${opt.value}`} />
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );

  const isManagingOther = managedUser.id !== currentUser.id;

  return (
    <div className="user-panel">
      <div className="panel-header">
        <h2>{isManagingOther ? `${managedUser.first_name}'s relations` : 'Your relations'}</h2>
        <button className="close-btn" onClick={onClose}>x</button>
      </div>

      {!!currentUser.is_admin && (
        <div className="admin-user-select">
          <select
            value={managedUserId}
            onChange={e => {
              setManagedUserId(parseInt(e.target.value));
              setMode('list');
            }}
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
          {managedUser.id !== currentUser.id && (
            <button
              className="admin-delete-profile-btn"
              onClick={() => setConfirmDeleteProfile(true)}
              title="Delete this user's profile"
            >
              Delete Profile
            </button>
          )}
        </div>
      )}

      {message && (
        <div className={`panel-message ${message.isError ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      <div className="panel-content">
        {mode === 'list' && (
          <>
            <div className="my-connections">
              {pendingIncoming.length > 0 && (
                <div className="pending-section">
                  <h4 className="pending-section-title">Pending Requests</h4>
                  {pendingIncoming.map(rel => (
                    <div key={rel.id} className="connection-item pending-item">
                      <div className="connection-info">
                        {rel.partnerAvatar ? (
                          <img src={rel.partnerAvatar} alt="" className="connection-avatar" />
                        ) : (
                          <div className="connection-avatar-placeholder">
                            {rel.partnerFirstName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <strong>{rel.partnerFirstName} {rel.partnerLastName}</strong>
                          <p className="connection-intensity">
                            <span className={`intensity-dot intensity-${rel.intensity || 'kiss'}`} />
                            {INTENSITY_LABELS[rel.intensity] || 'Kiss'}
                          </p>
                        </div>
                      </div>
                      <div className="item-actions">
                        <button
                          className="confirm-btn"
                          onClick={() => acceptRelationship(rel.id)}
                          disabled={loading}
                        >
                          Accept
                        </button>
                        <button
                          className="remove-btn"
                          onClick={() => declineRelationship(rel.id)}
                          disabled={loading}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingOutgoing.length > 0 && (
                <div className="pending-section">
                  <h4 className="pending-section-title">Awaiting Response</h4>
                  {pendingOutgoing.map(rel => (
                    <div key={rel.id} className="connection-item pending-item">
                      <div className="connection-info">
                        {rel.partnerAvatar ? (
                          <img src={rel.partnerAvatar} alt="" className="connection-avatar" />
                        ) : (
                          <div className="connection-avatar-placeholder">
                            {rel.partnerFirstName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <strong>{rel.partnerFirstName} {rel.partnerLastName}</strong>
                          <p className="connection-intensity">
                            <span className={`intensity-dot intensity-${rel.intensity || 'kiss'}`} />
                            {INTENSITY_LABELS[rel.intensity] || 'Kiss'}
                          </p>
                          <p className="connection-meta pending-label">Pending...</p>
                        </div>
                      </div>
                      <div className="item-actions">
                        <button
                          className="remove-btn"
                          onClick={() => setConfirmDelete(rel.id)}
                          disabled={loading}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {acceptedRelationships.length === 0 && pendingIncoming.length === 0 && pendingOutgoing.length === 0 ? (
                <p className="no-connections">No relations yet</p>
              ) : (
                acceptedRelationships.map(rel => (
                  <div key={rel.id} className="connection-item">
                    <div className="connection-info">
                      {rel.partnerAvatar ? (
                        <img src={rel.partnerAvatar} alt="" className="connection-avatar" />
                      ) : (
                        <div className="connection-avatar-placeholder">
                          {rel.partnerFirstName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <strong>{rel.partnerFirstName} {rel.partnerLastName}</strong>
                        <p className="connection-intensity">
                          <span className={`intensity-dot intensity-${rel.intensity || 'kiss'}`} />
                          {INTENSITY_LABELS[rel.intensity] || 'Kiss'}
                        </p>
                        {(rel.date || rel.context) && (
                          <p className="connection-meta">
                            {[formatDateForDisplay(rel.date, true), rel.context].filter(Boolean).join(' - ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="item-actions">
                      <button
                        className="edit-btn"
                        onClick={() => startEditRelation(rel)}
                        disabled={loading}
                      >
                        Edit
                      </button>
                      <button
                        className="remove-btn"
                        onClick={() => setConfirmDelete(rel.id)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              className="add-connection-btn"
              onClick={() => { setSearchQuery(''); setSelectedPersonId(''); setMode('add'); }}
            >
              + Add a relation
            </button>
          </>
        )}

        {mode === 'add' && (
          <div className="add-connection">
            <h3>Add a relation</h3>

            <div className="person-search">
              <input
                type="text"
                placeholder="Search for a person..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSelectedPersonId(''); }}
                autoFocus
              />
              {searchQuery.trim() && (
                <div className="search-results">
                  {filteredPeople.length > 0 ? (
                    filteredPeople.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`search-result-item ${selectedPersonId === String(p.id) ? 'selected' : ''}`}
                        onClick={() => { setSelectedPersonId(String(p.id)); setSearchQuery(`${p.first_name} ${p.last_name}`); }}
                      >
                        {p.avatar ? (
                          <img src={p.avatar} alt="" className="connection-avatar" style={{ width: 32, height: 32 }} />
                        ) : (
                          <div className="connection-avatar-placeholder" style={{ width: 32, height: 32, fontSize: 14 }}>
                            {p.first_name.charAt(0)}
                          </div>
                        )}
                        <span>{p.first_name} {p.last_name}</span>
                      </button>
                    ))
                  ) : (
                    <div className="no-search-results">
                      <p>No one found</p>
                      <button
                        className="create-new-btn"
                        onClick={() => setMode('create')}
                      >
                        + Add new tangler
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedPersonId && (
              <div className="relation-details">
                <div className="detail-group">
                  <label className="detail-label">How far?</label>
                  <IntensityRadios
                    value={newRelation.intensity}
                    onChange={v => setNewRelation(r => ({ ...r, intensity: v }))}
                  />
                </div>

                <div className="detail-group">
                  <label className="detail-label">When?</label>
                  <div className="date-picker-container">
                    <DatePicker
                      value={newRelation.date}
                      onChange={date => setNewRelation(r => ({ ...r, date }))}
                    />
                  </div>
                </div>

                <div className="detail-group">
                  <label className="detail-label">Where/Context?</label>
                  <input
                    type="text"
                    placeholder="e.g. Party at John's"
                    value={newRelation.context}
                    onChange={e => setNewRelation(r => ({ ...r, context: e.target.value }))}
                  />
                </div>

                <button
                  className="confirm-btn"
                  onClick={() => addRelationship(parseInt(selectedPersonId))}
                  disabled={loading}
                >
                  {loading ? 'Adding...' : 'Add'}
                </button>
              </div>
            )}

            <button className="back-btn" onClick={() => setMode('list')}>
              Back
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="create-person">
            <h3>+ Add new person</h3>

            <div className="name-row">
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

            <div className="relation-details">
              <div className="detail-group">
                <label className="detail-label">How far?</label>
                <IntensityRadios
                  value={newRelation.intensity}
                  onChange={v => setNewRelation(r => ({ ...r, intensity: v }))}
                />
              </div>

              <div className="detail-group">
                <label className="detail-label">When?</label>
                <div className="date-picker-container">
                  <DatePicker
                    value={newRelation.date}
                    onChange={date => setNewRelation(r => ({ ...r, date }))}
                  />
                </div>
              </div>

              <div className="detail-group">
                <label className="detail-label">Where/Context?</label>
                <input
                  type="text"
                  placeholder="e.g. Party at John's"
                  value={newRelation.context}
                  onChange={e => setNewRelation(r => ({ ...r, context: e.target.value }))}
                />
              </div>
            </div>

            <button
              className="confirm-btn"
              onClick={createPersonAndRelationship}
              disabled={loading}
            >
              {loading ? 'Adding...' : 'Add'}
            </button>

            <button className="back-btn" onClick={() => setMode('add')}>
              Back
            </button>
          </div>
        )}

        {mode === 'edit' && editingRelation && (
          <div className="edit-relation">
            <h3>Edit relation</h3>
            <p className="edit-partner">
              with <strong>{editingRelation.partnerFirstName} {editingRelation.partnerLastName}</strong>
            </p>

            <div className="relation-details">
              <div className="detail-group">
                <label className="detail-label">How far?</label>
                <IntensityRadios
                  value={editingRelation.intensity}
                  onChange={v => setEditingRelation(r => ({ ...r, intensity: v }))}
                />
              </div>

              <div className="detail-group">
                <label className="detail-label">When?</label>
                <div className="date-picker-container">
                  <DatePicker
                    value={editingRelation.date}
                    onChange={date => setEditingRelation(r => ({ ...r, date }))}
                  />
                </div>
              </div>

              <div className="detail-group">
                <label className="detail-label">Where/Context?</label>
                <input
                  type="text"
                  placeholder="e.g. Party at John's"
                  value={editingRelation.context}
                  onChange={e => setEditingRelation(r => ({ ...r, context: e.target.value }))}
                />
              </div>
            </div>

            <button
              className="confirm-btn"
              onClick={updateRelationship}
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update'}
            </button>

            <button className="back-btn" onClick={() => { setEditingRelation(null); setMode('list'); }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          message="Delete this relation?"
          onConfirm={() => deleteRelationship(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmDeleteProfile && (
        <ConfirmModal
          message={`Delete ${managedUser.first_name} ${managedUser.last_name}'s profile? This will remove them and all their connections.`}
          onConfirm={deleteProfile}
          onCancel={() => setConfirmDeleteProfile(false)}
        />
      )}

      {invitePerson && (
        <InviteModal
          person={invitePerson}
          onClose={() => setInvitePerson(null)}
        />
      )}
    </div>
  );
}

export default UserPanel;
