'use client';

import { useState, useMemo } from 'react';

export interface ProcessedWaterRec {
  id: number;
  fieldSeasonId: number;
  fieldName: string;
  operation: string;
  crop: string;
  date: string;
  recommendation: string;
  suggestedWaterDay: string;
}

export interface FieldSeasonOption {
  id: number;
  fieldName: string;
  operation: string;
}

interface WaterRecsClientProps {
  waterRecs: ProcessedWaterRec[];
  fieldSeasons: FieldSeasonOption[];
}

const WATER_DAY_OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const initialForm = {
  field_season: '',
  date: new Date().toISOString().split('T')[0],
  recommendation: '',
  suggested_water_day: '',
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function WaterRecsClient({ waterRecs: initialRecs, fieldSeasons }: WaterRecsClientProps) {
  const [waterRecs, setWaterRecs] = useState(initialRecs);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRec, setSelectedRec] = useState<ProcessedWaterRec | null>(null);
  const [addForm, setAddForm] = useState(initialForm);
  const [editForm, setEditForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecs = useMemo(() => {
    if (!searchQuery.trim()) return waterRecs;
    const query = searchQuery.toLowerCase();
    return waterRecs.filter(
      (r) =>
        r.fieldName.toLowerCase().includes(query) ||
        r.operation.toLowerCase().includes(query) ||
        r.recommendation.toLowerCase().includes(query)
    );
  }, [waterRecs, searchQuery]);

  const handleAdd = async () => {
    if (!addForm.field_season) {
      alert('Field is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        field_season: parseInt(addForm.field_season, 10),
        date: addForm.date,
      };
      if (addForm.recommendation) payload.recommendation = addForm.recommendation;
      if (addForm.suggested_water_day) payload.suggested_water_day = addForm.suggested_water_day;

      const response = await fetch('/api/water-recs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm(initialForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create recommendation');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create recommendation');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedRec) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        date: editForm.date,
        recommendation: editForm.recommendation || null,
        suggested_water_day: editForm.suggested_water_day || null,
      };

      const response = await fetch(`/api/water-recs/${selectedRec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowEditModal(false);
        setSelectedRec(null);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update recommendation');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update recommendation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec: ProcessedWaterRec) => {
    if (!confirm(`Delete recommendation for "${rec.fieldName}"?`)) return;
    try {
      const response = await fetch(`/api/water-recs/${rec.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setWaterRecs(waterRecs.filter((r) => r.id !== rec.id));
      } else {
        alert('Failed to delete recommendation');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete recommendation');
    }
  };

  const openEditModal = (rec: ProcessedWaterRec) => {
    setSelectedRec(rec);
    setEditForm({
      field_season: rec.fieldSeasonId.toString(),
      date: rec.date,
      recommendation: rec.recommendation,
      suggested_water_day: rec.suggestedWaterDay,
    });
    setShowEditModal(true);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Water Recommendations</h2>
          <span className="season-badge">2025 Season</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Recommendation
          </button>
        </div>
      </header>

      <div className="content">
        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">
              {searchQuery ? `Matching Recommendations (${filteredRecs.length})` : `All Recommendations (${waterRecs.length})`}
            </h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Field</th>
                <th>Operation</th>
                <th>Crop</th>
                <th>Recommendation</th>
                <th>Suggested Water Day</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRecs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {searchQuery ? 'No matching recommendations found.' : 'No water recommendations found.'}
                  </td>
                </tr>
              ) : (
                filteredRecs.map((rec) => (
                  <tr key={rec.id}>
                    <td style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{formatDate(rec.date)}</td>
                    <td className="operation-name">{rec.fieldName}</td>
                    <td style={{ fontSize: '13px' }}>{rec.operation}</td>
                    <td>
                      <span className={`crop-badge ${rec.crop.toLowerCase()}`}>{rec.crop}</span>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.4 }}>
                        {rec.recommendation || '—'}
                      </div>
                    </td>
                    <td>
                      {rec.suggestedWaterDay ? (
                        <span className="status-badge in-stock">
                          {rec.suggestedWaterDay}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="action-btn" title="Edit" onClick={() => openEditModal(rec)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className="action-btn" title="Delete" onClick={() => handleDelete(rec)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>New Water Recommendation</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Field *</label>
                  <select
                    value={addForm.field_season}
                    onChange={(e) => setAddForm({ ...addForm, field_season: e.target.value })}
                  >
                    <option value="">Select field...</option>
                    {fieldSeasons.map((fs) => (
                      <option key={fs.id} value={fs.id}>
                        {fs.fieldName} ({fs.operation})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={addForm.date}
                    onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Recommendation</label>
                  <textarea
                    value={addForm.recommendation}
                    onChange={(e) => setAddForm({ ...addForm, recommendation: e.target.value })}
                    placeholder="Enter recommendation..."
                    rows={4}
                  />
                </div>
                <div className="form-group">
                  <label>Suggested Water Day</label>
                  <select
                    value={addForm.suggested_water_day}
                    onChange={(e) => setAddForm({ ...addForm, suggested_water_day: e.target.value })}
                  >
                    <option value="">Select day...</option>
                    {WATER_DAY_OPTIONS.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create Recommendation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedRec && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Recommendation</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Field</label>
                  <input type="text" value={selectedRec.fieldName} disabled />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Recommendation</label>
                  <textarea
                    value={editForm.recommendation}
                    onChange={(e) => setEditForm({ ...editForm, recommendation: e.target.value })}
                    placeholder="Enter recommendation..."
                    rows={4}
                  />
                </div>
                <div className="form-group">
                  <label>Suggested Water Day</label>
                  <select
                    value={editForm.suggested_water_day}
                    onChange={(e) => setEditForm({ ...editForm, suggested_water_day: e.target.value })}
                  >
                    <option value="">Select day...</option>
                    {WATER_DAY_OPTIONS.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
