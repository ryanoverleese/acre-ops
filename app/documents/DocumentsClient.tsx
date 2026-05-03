'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type { ProcessedDocument } from './page';
import { useResizableColumns } from '@/hooks/useResizableColumns';

const DOC_COL_WIDTHS = { name: 200, type: 80, size: 80, uploadedBy: 140, date: 120, description: 260 } as const;
const NOTE_COL_WIDTHS = { name: 200, note: 360, uploadedBy: 140, date: 120 } as const;

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
type DocSortCol = 'name' | 'type' | 'size' | 'uploadedBy' | 'date';
type NoteSortCol = 'name' | 'uploadedBy' | 'date';
type SortDir = 'asc' | 'desc';

function SortTh({ label, col, sortCol, sortDir, onSort, onResizeStart, onResetWidth, resizing }: {
  label: string; col: string; sortCol: string; sortDir: SortDir; onSort: (col: string) => void;
  onResizeStart: (col: string, e: React.MouseEvent) => void;
  onResetWidth: (col: string) => void;
  resizing: boolean;
}) {
  const active = sortCol === col;
  return (
    <th className="th-resizable" style={{ whiteSpace: 'nowrap' }}>
      <span onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
        </span>
      </span>
      <div
        className={`resize-handle${resizing ? ' active' : ''}`}
        onMouseDown={(e) => onResizeStart(col, e)}
        onDoubleClick={() => onResetWidth(col)}
        title="Drag to resize, double-click to reset"
      />
    </th>
  );
}

export default function DocumentsClient({ initialDocuments }: DocumentsClientProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role !== 'installer';

  const [allItems, setAllItems] = useState<ProcessedDocument[]>(initialDocuments);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', description: '', file: null as File | null, date: '' });

  const { columnWidths: docWidths, resizingColumn: docResizing, handleResizeStart: _docRS, handleResetColumnWidth: _docRW } = useResizableColumns({ defaultWidths: DOC_COL_WIDTHS, storageKey: 'documents-col-widths' });
  const { columnWidths: noteWidths, resizingColumn: noteResizing, handleResizeStart: _noteRS, handleResetColumnWidth: _noteRW } = useResizableColumns({ defaultWidths: NOTE_COL_WIDTHS, storageKey: 'notes-col-widths' });
  const docResizeStart = _docRS as (col: string, e: React.MouseEvent) => void;
  const docResetWidth = _docRW as (col: string) => void;
  const noteResizeStart = _noteRS as (col: string, e: React.MouseEvent) => void;
  const noteResetWidth = _noteRW as (col: string) => void;

  const [docSortCol, setDocSortCol] = useState<DocSortCol>('date');
  const [docSortDir, setDocSortDir] = useState<SortDir>('desc');
  const [noteSortCol, setNoteSortCol] = useState<NoteSortCol>('date');
  const [noteSortDir, setNoteSortDir] = useState<SortDir>('desc');

  function handleDocSort(col: string) {
    const c = col as DocSortCol;
    if (docSortCol === c) setDocSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDocSortCol(c); setDocSortDir('asc'); }
  }
  function handleNoteSort(col: string) {
    const c = col as NoteSortCol;
    if (noteSortCol === c) setNoteSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setNoteSortCol(c); setNoteSortDir('asc'); }
  }

  const docs = useMemo(() => {
    const list = allItems.filter((d) => d.fileUrl);
    return list.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (docSortCol) {
        case 'name':       av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'type':       av = getFileIcon(a.mimeType); bv = getFileIcon(b.mimeType); break;
        case 'size':       av = a.fileSize; bv = b.fileSize; break;
        case 'uploadedBy': av = a.uploadedBy.toLowerCase(); bv = b.uploadedBy.toLowerCase(); break;
        case 'date':       av = a.uploadedAt || ''; bv = b.uploadedAt || ''; break;
      }
      if (av < bv) return docSortDir === 'asc' ? -1 : 1;
      if (av > bv) return docSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allItems, docSortCol, docSortDir]);

  const notes = useMemo(() => {
    const list = allItems.filter((d) => !d.fileUrl);
    return list.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (noteSortCol) {
        case 'name':       av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'uploadedBy': av = a.uploadedBy.toLowerCase(); bv = b.uploadedBy.toLowerCase(); break;
        case 'date':       av = a.uploadedAt || ''; bv = b.uploadedAt || ''; break;
      }
      if (av < bv) return noteSortDir === 'asc' ? -1 : 1;
      if (av > bv) return noteSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allItems, noteSortCol, noteSortDir]);

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
      if (uploadForm.date) formData.append('date', uploadForm.date);
      formData.append('uploaded_by', session?.user?.name || 'Unknown');

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setModalMode(null);
        setUploadForm({ name: '', description: '', file: null, date: '' });
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

        <table className="desktop-table" style={{ userSelect: docResizing ? 'none' : undefined }}>
          <colgroup>
            <col style={{ width: docWidths.name }} />
            <col style={{ width: docWidths.type }} />
            <col style={{ width: docWidths.size }} />
            <col style={{ width: docWidths.uploadedBy }} />
            <col style={{ width: docWidths.date }} />
            <col style={{ width: docWidths.description }} />
            {isAdmin && <col style={{ width: 50 }} />}
          </colgroup>
          <thead>
            <tr>
              <SortTh label="Name" col="name" sortCol={docSortCol} sortDir={docSortDir} onSort={handleDocSort} onResizeStart={docResizeStart} onResetWidth={docResetWidth} resizing={docResizing === 'name'} />
              <SortTh label="Type" col="type" sortCol={docSortCol} sortDir={docSortDir} onSort={handleDocSort} onResizeStart={docResizeStart} onResetWidth={docResetWidth} resizing={docResizing === 'type'} />
              <SortTh label="Size" col="size" sortCol={docSortCol} sortDir={docSortDir} onSort={handleDocSort} onResizeStart={docResizeStart} onResetWidth={docResetWidth} resizing={docResizing === 'size'} />
              <SortTh label="Uploaded By" col="uploadedBy" sortCol={docSortCol} sortDir={docSortDir} onSort={handleDocSort} onResizeStart={docResizeStart} onResetWidth={docResetWidth} resizing={docResizing === 'uploadedBy'} />
              <SortTh label="Date" col="date" sortCol={docSortCol} sortDir={docSortDir} onSort={handleDocSort} onResizeStart={docResizeStart} onResetWidth={docResetWidth} resizing={docResizing === 'date'} />
              <th className="th-resizable">
                <span>Description</span>
                <div className={`resize-handle${docResizing === 'description' ? ' active' : ''}`} onMouseDown={(e) => docResizeStart('description', e)} onDoubleClick={() => docResetWidth('description')} title="Drag to resize, double-click to reset" />
              </th>
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

        <table className="desktop-table" style={{ userSelect: noteResizing ? 'none' : undefined }}>
          <colgroup>
            <col style={{ width: noteWidths.name }} />
            <col style={{ width: noteWidths.note }} />
            <col style={{ width: noteWidths.uploadedBy }} />
            <col style={{ width: noteWidths.date }} />
            {isAdmin && <col style={{ width: 50 }} />}
          </colgroup>
          <thead>
            <tr>
              <SortTh label="Title" col="name" sortCol={noteSortCol} sortDir={noteSortDir} onSort={handleNoteSort} onResizeStart={noteResizeStart} onResetWidth={noteResetWidth} resizing={noteResizing === 'name'} />
              <th className="th-resizable">
                <span>Note</span>
                <div className={`resize-handle${noteResizing === 'note' ? ' active' : ''}`} onMouseDown={(e) => noteResizeStart('note', e)} onDoubleClick={() => noteResetWidth('note')} title="Drag to resize, double-click to reset" />
              </th>
              <SortTh label="By" col="uploadedBy" sortCol={noteSortCol} sortDir={noteSortDir} onSort={handleNoteSort} onResizeStart={noteResizeStart} onResetWidth={noteResetWidth} resizing={noteResizing === 'uploadedBy'} />
              <SortTh label="Date" col="date" sortCol={noteSortCol} sortDir={noteSortDir} onSort={handleNoteSort} onResizeStart={noteResizeStart} onResetWidth={noteResetWidth} resizing={noteResizing === 'date'} />
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
              {modalMode === 'note' && (
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    className="input"
                    value={uploadForm.date}
                    onChange={(e) => setUploadForm({ ...uploadForm, date: e.target.value })}
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
