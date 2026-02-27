'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type { ProcessedDocument } from './page';

interface DocumentsClientProps {
  initialDocuments: ProcessedDocument[];
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFileIcon(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'XLS';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
  if (mimeType.includes('image')) return 'IMG';
  return 'FILE';
}

type ModalMode = 'document' | 'note' | null;

export default function DocumentsClient({ initialDocuments }: DocumentsClientProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role !== 'installer';

  const [allItems, setAllItems] = useState<ProcessedDocument[]>(initialDocuments);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', description: '', file: null as File | null });

  const docs = useMemo(() => allItems.filter((d) => d.fileUrl), [allItems]);
  const notes = useMemo(() => allItems.filter((d) => !d.fileUrl), [allItems]);

  const handleSave = async () => {
    if (!uploadForm.name.trim()) {
      alert('Name is required');
      return;
    }
    if (modalMode === 'document' && !uploadForm.file) {
      alert('File is required for a document');
      return;
    }
    setSaving(true);

    try {
      const formData = new FormData();
      if (uploadForm.file) formData.append('file', uploadForm.file);
      formData.append('name', uploadForm.name);
      if (uploadForm.description) formData.append('description', uploadForm.description);
      formData.append('uploaded_by', session?.user?.name || 'Unknown');

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setModalMode(null);
        setUploadForm({ name: '', description: '', file: null });
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Save failed');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: ProcessedDocument) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;

    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (response.ok) {
        setAllItems((prev) => prev.filter((d) => d.id !== doc.id));
      } else {
        alert('Failed to delete');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete');
    }
  };

  const deleteButton = (doc: ProcessedDocument) => (
    <button className="action-btn" title="Delete" onClick={() => handleDelete(doc)}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );

  return (
    <>
      {/* Documents Section */}
      <div className="table-container" style={{ marginBottom: '24px' }}>
        <div className="table-header">
          <h3 className="table-title">Documents</h3>
          <div className="table-actions">
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setModalMode('document')}>
                + Upload Document
              </button>
            )}
          </div>
        </div>

        <table className="desktop-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Uploaded By</th>
              <th>Date</th>
              <th>Description</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="entity-empty">
                  No documents yet. Upload your first one.
                </td>
              </tr>
            )}
            {docs.map((doc) => (
              <tr key={doc.id}>
                <td className="operation-name">
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                    {doc.name}
                  </a>
                </td>
                <td><span className="status-badge installed"><span className="status-dot"></span>{getFileIcon(doc.mimeType)}</span></td>
                <td>{formatFileSize(doc.fileSize)}</td>
                <td>{doc.uploadedBy}</td>
                <td>{formatDate(doc.uploadedAt)}</td>
                <td className="settings-cell-description">{doc.description || '—'}</td>
                {isAdmin && <td>{deleteButton(doc)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile cards for documents */}
        <div className="mobile-cards">
          {docs.length === 0 && (
            <div className="empty-state">No documents yet.</div>
          )}
          {docs.map((doc) => (
            <div key={doc.id} className="mobile-card" onClick={() => window.open(doc.fileUrl, '_blank')}>
              <div className="mobile-card-header">
                <span className="mobile-card-title">{doc.name}</span>
                <span className="status-badge installed"><span className="status-dot"></span>{getFileIcon(doc.mimeType)}</span>
              </div>
              <div className="mobile-card-body">
                <div className="mobile-card-row">
                  <span>Size:</span>
                  <span>{formatFileSize(doc.fileSize)}</span>
                </div>
                <div className="mobile-card-row">
                  <span>By:</span>
                  <span>{doc.uploadedBy} · {formatDate(doc.uploadedAt)}</span>
                </div>
                {doc.description && (
                  <div className="mobile-card-row">
                    <span>Notes:</span>
                    <span>{doc.description}</span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="mobile-card-footer inv-mobile-footer">
                  <button className="btn btn-secondary inv-btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notes Section */}
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Notes &amp; Reminders</h3>
          <div className="table-actions">
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setModalMode('note')}>
                + Add Note
              </button>
            )}
          </div>
        </div>

        <table className="desktop-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Note</th>
              <th>By</th>
              <th>Date</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {notes.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="entity-empty">
                  No notes yet. Add your first one.
                </td>
              </tr>
            )}
            {notes.map((note) => (
              <tr key={note.id}>
                <td className="operation-name">{note.name}</td>
                <td style={{ whiteSpace: 'pre-wrap', maxWidth: '400px' }}>{note.description || '—'}</td>
                <td>{note.uploadedBy}</td>
                <td>{formatDate(note.uploadedAt)}</td>
                {isAdmin && <td>{deleteButton(note)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile cards for notes */}
        <div className="mobile-cards">
          {notes.length === 0 && (
            <div className="empty-state">No notes yet.</div>
          )}
          {notes.map((note) => (
            <div key={note.id} className="mobile-card">
              <div className="mobile-card-header">
                <span className="mobile-card-title">{note.name}</span>
                <span className="status-badge pending"><span className="status-dot"></span>NOTE</span>
              </div>
              {note.description && (
                <div className="mobile-card-body">
                  <div className="mobile-card-row" style={{ whiteSpace: 'pre-wrap' }}>
                    {note.description}
                  </div>
                </div>
              )}
              <div className="mobile-card-body">
                <div className="mobile-card-row">
                  <span>By:</span>
                  <span>{note.uploadedBy} · {formatDate(note.uploadedAt)}</span>
                </div>
              </div>
              {isAdmin && (
                <div className="mobile-card-footer inv-mobile-footer">
                  <button className="btn btn-secondary inv-btn-sm" onClick={() => handleDelete(note)}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add Modal */}
      {modalMode && (
        <div className="detail-panel-overlay" onClick={() => setModalMode(null)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>{modalMode === 'document' ? 'Upload Document' : 'Add Note'}</h3>
              <button className="close-btn" onClick={() => setModalMode(null)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="form-group">
                <label>{modalMode === 'document' ? 'Name *' : 'Title *'}</label>
                <input
                  type="text"
                  className="input"
                  placeholder={modalMode === 'document' ? 'e.g. Davis 2026 Price List' : 'e.g. Remember to call Davis rep'}
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                />
              </div>
              {modalMode === 'document' && (
                <div className="form-group">
                  <label>File *</label>
                  <input
                    type="file"
                    className="input"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                    onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                  />
                </div>
              )}
              <div className="form-group">
                <label>{modalMode === 'document' ? 'Description' : 'Note *'}</label>
                <textarea
                  className="input"
                  placeholder={modalMode === 'document' ? 'Optional notes about this document...' : 'Write your note here...'}
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  rows={modalMode === 'note' ? 5 : 3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
