import { useState, useMemo } from 'react';
import AvatarUpload from './AvatarUpload';
import ConfirmModal from './ConfirmModal';
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
  const [newPerson, setNewPerson] = useState({ first_name: '', last_name: '', bio: '', avatar: '', is_civ: false });
  const [editingRelation, setEditingRelation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // The user whose relationships we're managing (admin can change this)
  const managedUser = useMemo(() => {
    return people.find(p => p.id === managedUserId) || currentUser;
  }, [people, managedUserId, currentUser]);

  // Get managed user's relationships
  const myRelationships = useMemo(() => {
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
    });
  }, [relationships, managedUser.id]);

  // People not yet connected to managed user
  const availablePeople = useMemo(() => {
    const connectedIds = new Set(myRelationships.map(r => r.partnerId));
    connectedIds.add(managedUser.id);
    return people.filter(p => !connectedIds.has(p.id));
  }, [people, myRelationships, managedUser.id]);

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
          context: newRelation.context || null
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
      showMessage('Relationship added');
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
      // Create the new person
      const personRes = await fetch(`${API_BASE}/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPerson)
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
          context: newRelation.context || null
        })
      });

      if (!relRes.ok) throw new Error('Failed to create relationship');

      setNewPerson({ first_name: '', last_name: '', bio: '', avatar: '', is_civ: false });
      setNewRelation({ intensity: 'kiss', date: '', context: '' });
      setMode('list');
      onDataChange();
      showMessage(`Added ${createdPerson.first_name} and linked`);
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

  const IntensityRadios = ({ value, onChange }) => (
    <div className="intensity-options">
      {INTENSITY_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`intensity-option ${value === opt.value ? 'selected' : ''}`}
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
            {people.map(p => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name} {p.id === currentUser.id ? '(You)' : ''}
              </option>
            ))}
          </select>
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
              {myRelationships.length === 0 ? (
                <p className="no-connections">No relations yet</p>
              ) : (
                myRelationships.map(rel => (
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
                            {[rel.date, rel.context].filter(Boolean).join(' - ')}
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
              onClick={() => setMode('add')}
            >
              + Add a relation
            </button>
          </>
        )}

        {mode === 'add' && (
          <div className="add-connection">
            <h3>Add a relation</h3>

            {availablePeople.length > 0 && (
              <div className="person-select">
                <select
                  value={selectedPersonId}
                  onChange={e => setSelectedPersonId(e.target.value)}
                >
                  <option value="">Select a person</option>
                  {availablePeople.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="create-new-btn"
              onClick={() => setMode('create')}
            >
              + Add new person
            </button>

            {selectedPersonId && (
              <div className="relation-details">
                <label className="detail-label">How far?</label>
                <IntensityRadios
                  value={newRelation.intensity}
                  onChange={v => setNewRelation(r => ({ ...r, intensity: v }))}
                />

                <input
                  type="text"
                  placeholder="When? (e.g., Summer 2023)"
                  value={newRelation.date}
                  onChange={e => setNewRelation(r => ({ ...r, date: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Where/Context?"
                  value={newRelation.context}
                  onChange={e => setNewRelation(r => ({ ...r, context: e.target.value }))}
                />
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

            <div className="avatar-upload">
              <AvatarUpload
                value={newPerson.avatar}
                onChange={(avatar) => setNewPerson(prev => ({ ...prev, avatar }))}
                size={80}
              />
            </div>

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

            <button
              type="button"
              className={`civ-toggle-container ${newPerson.is_civ ? 'active' : ''}`}
              onClick={() => setNewPerson(p => ({ ...p, is_civ: !p.is_civ }))}
            >
              <span className="civ-toggle-label">Part of CIV</span>
              <span className="civ-toggle-track">
                <span className="civ-toggle-thumb" />
              </span>
            </button>

            <div className="relation-details">
              <label className="detail-label">How far?</label>
              <IntensityRadios
                value={newRelation.intensity}
                onChange={v => setNewRelation(r => ({ ...r, intensity: v }))}
              />

              <input
                type="text"
                placeholder="When? (e.g., Summer 2023)"
                value={newRelation.date}
                onChange={e => setNewRelation(r => ({ ...r, date: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Where/Context?"
                value={newRelation.context}
                onChange={e => setNewRelation(r => ({ ...r, context: e.target.value }))}
              />
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
              <label className="detail-label">How far?</label>
              <IntensityRadios
                value={editingRelation.intensity}
                onChange={v => setEditingRelation(r => ({ ...r, intensity: v }))}
              />

              <input
                type="text"
                placeholder="When? (e.g., Summer 2023)"
                value={editingRelation.date}
                onChange={e => setEditingRelation(r => ({ ...r, date: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Where/Context?"
                value={editingRelation.context}
                onChange={e => setEditingRelation(r => ({ ...r, context: e.target.value }))}
              />
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
    </div>
  );
}

export default UserPanel;
