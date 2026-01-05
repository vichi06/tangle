import { useState, useRef } from 'react';
import './AdminPanel.css';

const API_BASE = '/api';

function AdminPanel({ people, relationships, onDataChange, onClose }) {
  const [activeTab, setActiveTab] = useState('people');
  const [editingPerson, setEditingPerson] = useState(null);
  const [newPerson, setNewPerson] = useState({ first_name: '', last_name: '', bio: '', avatar: '' });
  const [newRelationship, setNewRelationship] = useState({
    person1_id: '',
    person2_id: '',
    date: '',
    context: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAvatarChange = async (e, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      if (isEdit) {
        setEditingPerson(prev => ({ ...prev, avatar: base64 }));
      } else {
        setNewPerson(prev => ({ ...prev, avatar: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  const addPerson = async () => {
    if (!newPerson.first_name.trim() || !newPerson.last_name.trim()) {
      showMessage('First and last name are required', true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPerson)
      });

      if (!res.ok) throw new Error('Failed to add person');

      setNewPerson({ first_name: '', last_name: '', bio: '', avatar: '' });
      onDataChange();
      showMessage('Person added');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const updatePerson = async () => {
    if (!editingPerson?.first_name?.trim() || !editingPerson?.last_name?.trim()) {
      showMessage('First and last name are required', true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/people/${editingPerson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPerson)
      });

      if (!res.ok) throw new Error('Failed to update person');

      setEditingPerson(null);
      onDataChange();
      showMessage('Person updated');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const deletePerson = async (id) => {
    if (!confirm('Delete this person and all their relationships?')) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/people/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete person');

      onDataChange();
      showMessage('Person deleted');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const addRelationship = async () => {
    if (!newRelationship.person1_id || !newRelationship.person2_id) {
      showMessage('Select both people', true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRelationship,
          person1_id: parseInt(newRelationship.person1_id),
          person2_id: parseInt(newRelationship.person2_id)
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add relationship');
      }

      setNewRelationship({ person1_id: '', person2_id: '', date: '', context: '' });
      onDataChange();
      showMessage('Relationship added');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const deleteRelationship = async (id) => {
    if (!confirm('Delete this relationship?')) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/relationships/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete relationship');

      onDataChange();
      showMessage('Relationship deleted');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async () => {
    try {
      const res = await fetch(`${API_BASE}/export`);
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kissgraph-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showMessage('Data exported');
    } catch (err) {
      showMessage(err.message, true);
    }
  };

  const importData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const clearExisting = confirm('Clear existing data before import?');

      const res = await fetch(`${API_BASE}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, clearExisting })
      });

      if (!res.ok) throw new Error('Import failed');

      const result = await res.json();
      onDataChange();
      showMessage(`Imported ${result.peopleImported} people, ${result.relationshipsImported} relationships`);
    } catch (err) {
      showMessage(err.message, true);
    }

    e.target.value = '';
  };

  const getFullName = (person) => `${person.first_name} ${person.last_name}`;

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Admin Panel</h2>
        <button className="close-btn" onClick={onClose}>x</button>
      </div>

      {message && (
        <div className={`admin-message ${message.isError ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      <div className="admin-tabs">
        <button
          className={activeTab === 'people' ? 'active' : ''}
          onClick={() => setActiveTab('people')}
        >
          People ({people.length})
        </button>
        <button
          className={activeTab === 'relationships' ? 'active' : ''}
          onClick={() => setActiveTab('relationships')}
        >
          Links ({relationships.length})
        </button>
        <button
          className={activeTab === 'import' ? 'active' : ''}
          onClick={() => setActiveTab('import')}
        >
          Import/Export
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'people' && (
          <div className="tab-people">
            <div className="add-form">
              <h3>Add Person</h3>
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
              <div className="avatar-input">
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleAvatarChange(e)}
                />
                {newPerson.avatar && (
                  <img src={newPerson.avatar} alt="Preview" className="avatar-preview" />
                )}
              </div>
              <button onClick={addPerson} disabled={loading}>Add Person</button>
            </div>

            <div className="list">
              <h3>People</h3>
              {people.map(person => (
                <div key={person.id} className="list-item">
                  {editingPerson?.id === person.id ? (
                    <div className="edit-form">
                      <div className="name-row">
                        <input
                          type="text"
                          placeholder="First name"
                          value={editingPerson.first_name}
                          onChange={e => setEditingPerson(p => ({ ...p, first_name: e.target.value }))}
                        />
                        <input
                          type="text"
                          placeholder="Last name"
                          value={editingPerson.last_name}
                          onChange={e => setEditingPerson(p => ({ ...p, last_name: e.target.value }))}
                        />
                      </div>
                      <textarea
                        value={editingPerson.bio || ''}
                        onChange={e => setEditingPerson(p => ({ ...p, bio: e.target.value }))}
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleAvatarChange(e, true)}
                      />
                      <div className="edit-actions">
                        <button onClick={updatePerson} disabled={loading}>Save</button>
                        <button onClick={() => setEditingPerson(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="item-info">
                        {person.avatar && (
                          <img src={person.avatar} alt={getFullName(person)} className="item-avatar" />
                        )}
                        <div>
                          <strong>{getFullName(person)}</strong>
                          {person.bio && <p>{person.bio}</p>}
                        </div>
                      </div>
                      <div className="item-actions">
                        <button onClick={() => setEditingPerson({ ...person })}>Edit</button>
                        <button onClick={() => deletePerson(person.id)}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'relationships' && (
          <div className="tab-relationships">
            <div className="add-form">
              <h3>Add Relationship</h3>
              <select
                value={newRelationship.person1_id}
                onChange={e => setNewRelationship(r => ({ ...r, person1_id: e.target.value }))}
              >
                <option value="">Select person 1</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{getFullName(p)}</option>
                ))}
              </select>
              <select
                value={newRelationship.person2_id}
                onChange={e => setNewRelationship(r => ({ ...r, person2_id: e.target.value }))}
              >
                <option value="">Select person 2</option>
                {people
                  .filter(p => p.id !== parseInt(newRelationship.person1_id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{getFullName(p)}</option>
                  ))}
              </select>
              <input
                type="text"
                placeholder="Date (e.g., Summer 2023)"
                value={newRelationship.date}
                onChange={e => setNewRelationship(r => ({ ...r, date: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Context (e.g., Party at Jake's)"
                value={newRelationship.context}
                onChange={e => setNewRelationship(r => ({ ...r, context: e.target.value }))}
              />
              <button onClick={addRelationship} disabled={loading}>Add Relationship</button>
            </div>

            <div className="list">
              <h3>Relationships</h3>
              {relationships.map(rel => (
                <div key={rel.id} className="list-item">
                  <div className="item-info">
                    <strong>{rel.person1_first_name} {rel.person1_last_name} - {rel.person2_first_name} {rel.person2_last_name}</strong>
                    {(rel.date || rel.context) && (
                      <p>{[rel.date, rel.context].filter(Boolean).join(' | ')}</p>
                    )}
                  </div>
                  <div className="item-actions">
                    <button onClick={() => deleteRelationship(rel.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'import' && (
          <div className="tab-import">
            <div className="import-section">
              <h3>Export Data</h3>
              <p>Download all people and relationships as JSON.</p>
              <button onClick={exportData}>Export JSON</button>
            </div>

            <div className="import-section">
              <h3>Import Data</h3>
              <p>Import people and relationships from a JSON file.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={importData}
                style={{ display: 'none' }}
              />
              <button onClick={() => fileInputRef.current?.click()}>
                Select JSON File
              </button>
            </div>

            <div className="import-section">
              <h3>JSON Format</h3>
              <pre>{`{
  "people": [
    { "id": 1, "first_name": "Alice",
      "last_name": "Smith", "bio": "..." },
    { "id": 2, "first_name": "Bob",
      "last_name": "Jones" }
  ],
  "relationships": [
    { "person1_id": 1, "person2_id": 2,
      "date": "2023", "context": "Party" }
  ]
}`}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
