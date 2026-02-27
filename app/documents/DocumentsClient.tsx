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

export default function DocumentsClient({ initialDocuments }: DocumentsClientProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role !== 'installer';

  const [documents, setDocuments] = useState<ProcessedDocument[]>(initialDocuments);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', description: '', file: null as File | null });

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.name.trim()) {
      alert('Name and file are required');
      return;
    }
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('name', uploadForm.name);
      if (uploadForm.description) formData.append('description', uploadForm.description);
      formData.append('uploaded_by', session?.user?.name || 'Unknown');

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setShowUploadModal(false);
        setUploadForm({ name: '', description: '', file: null });
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: ProcessedDocument) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;

    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (response.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      } else {
        alert('Failed to delete document');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete document');
    }
  };

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Company Documents</h3>
          <div className="table-actions">
            <div className="search-box">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                + Upload
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="entity-empty">
                  {documents.length === 0 ? 'No documents yet. Upload your first one.' : 'No documents match your search.'}
                </td>
              </tr>
            )}
            {filtered.map((doc) => (
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
                {isAdmin && (
                  <td>
                    <button className="action-btn" title="Delete" onClick={() => handleDelete(doc)}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="mobile-cards">
          {filtered.length === 0 && (
            <div className="empty-state">
              {documents.length === 0 ? 'No documents yet.' : 'No documents match your search.'}
            </div>
          )}
          {filtered.map((doc) => (
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
                  <span>Uploaded:</span>
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
                  <button
                    className="btn btn-secondary inv-btn-sm"
                    onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="detail-panel-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Upload Document</h3>
              <button className="close-btn" onClick={() => setShowUploadModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Davis 2026 Price List"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>File *</label>
                <input
                  type="file"
                  className="input"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                  onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Optional notes"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
