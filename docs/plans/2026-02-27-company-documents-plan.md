# Company Documents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a shared document library page where admins upload reference files (price lists, manuals) and all users can view/download.

**Architecture:** New Baserow table `documents` stores metadata + file references. Server component fetches rows, client component handles search/upload/delete. File upload reuses Baserow's file API (same pattern as install photos). Nav link added to Admin section.

**Tech Stack:** Next.js 16 App Router, Baserow API, Baserow file storage

---

### Task 1: Create Baserow table

**Pre-requisite:** Create `documents` table in Baserow with these fields:
- `name` (text) — document display name
- `file` (file field) — the uploaded file
- `description` (long text) — optional notes
- `uploaded_by` (text) — uploader's name
- `uploaded_at` (date, include time) — upload timestamp

After creating, add the table ID to the codebase.

**Files:**
- Modify: `lib/baserow.ts:53-72`

**Step 1: Add table ID**

In the `TABLE_IDS` object, add:
```typescript
  notifications: 854433,
  documents: <TABLE_ID>,  // ← replace with actual ID from Baserow
```

**Step 2: Add TypeScript interface**

Below the existing interfaces (after `FieldSeason`, around line 372), add:
```typescript
export interface Document {
  id: number;
  name?: string;
  file?: { url: string; name: string; size: number; mime_type: string; is_image: boolean }[];
  description?: string;
  uploaded_by?: string;
  uploaded_at?: string;
}
```

**Step 3: Add convenience getter**

After the existing getter functions (around line 470), add:
```typescript
export async function getDocuments(): Promise<Document[]> {
  return getRows<Document>('documents', { orderBy: '-uploaded_at' });
}
```

**Step 4: Commit**
```bash
git add lib/baserow.ts
git commit -m "feat: add documents table to Baserow config"
```

---

### Task 2: API routes for documents

**Files:**
- Create: `app/api/documents/route.ts`
- Create: `app/api/documents/[id]/route.ts`

**Step 1: Create the list + upload route**

Create `app/api/documents/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_FILE_UPLOAD_URL = 'https://api.baserow.io/api/user-files/upload-file/';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface BaserowFile {
  url: string;
  name: string;
  size: number;
  mime_type: string;
  is_image: boolean;
  image_width: number;
  image_height: number;
  uploaded_at: string;
}

async function uploadFileToBaserow(file: File): Promise<BaserowFile | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(BASEROW_FILE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
      },
      body: formData,
    });

    if (!response.ok) {
      console.error('Baserow file upload error:', response.status, await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error uploading file to Baserow:', error);
    return null;
  }
}

// POST - Upload document
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string | null;
    const uploadedBy = formData.get('uploaded_by') as string;

    if (!file || !name) {
      return NextResponse.json({ error: 'File and name are required' }, { status: 400 });
    }

    // Upload file to Baserow storage
    const uploadedFile = await uploadFileToBaserow(file);
    if (!uploadedFile) {
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Create row in documents table
    const payload: Record<string, unknown> = {
      name,
      file: [{ name: uploadedFile.name }],
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
    };
    if (description) payload.description = description;

    const response = await fetch(`${BASEROW_API_URL}/${TABLE_IDS.documents}/?user_field_names=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Baserow error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload document error:', error);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}
```

**Step 2: Create the delete route**

Create `app/api/documents/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// DELETE - Delete document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await fetch(`${BASEROW_API_URL}/${TABLE_IDS.documents}/${id}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Baserow error: ${error}` }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
```

**Step 3: Commit**
```bash
git add app/api/documents/
git commit -m "feat: add documents API routes (upload + delete)"
```

---

### Task 3: Server page component

**Files:**
- Create: `app/documents/page.tsx`

**Step 1: Create the server page**

Create `app/documents/page.tsx`:
```typescript
import { getDocuments } from '@/lib/baserow';
import DocumentsClient from './DocumentsClient';

export const dynamic = 'force-dynamic';

export interface ProcessedDocument {
  id: number;
  name: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  description: string;
  uploadedBy: string;
  uploadedAt: string;
}

export default async function DocumentsPage() {
  let documents: ProcessedDocument[] = [];

  try {
    const raw = await getDocuments();
    documents = raw.map((doc) => ({
      id: doc.id,
      name: doc.name || '',
      fileUrl: doc.file?.[0]?.url || '',
      fileName: doc.file?.[0]?.name || '',
      fileSize: doc.file?.[0]?.size || 0,
      mimeType: doc.file?.[0]?.mime_type || '',
      description: doc.description || '',
      uploadedBy: doc.uploaded_by || '',
      uploadedAt: doc.uploaded_at || '',
    }));
  } catch (error) {
    console.error('Error fetching documents:', error);
  }

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Documents</h2>
        </div>
      </header>

      <div className="content">
        <DocumentsClient initialDocuments={documents} />
      </div>
    </>
  );
}
```

**Step 2: Commit**
```bash
git add app/documents/page.tsx
git commit -m "feat: add documents server page with data fetching"
```

---

### Task 4: Client component

**Files:**
- Create: `app/documents/DocumentsClient.tsx`

**Step 1: Create the full client component**

Create `app/documents/DocumentsClient.tsx`:
```typescript
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
```

**Step 2: Commit**
```bash
git add app/documents/DocumentsClient.tsx
git commit -m "feat: add documents client component with search, upload, delete"
```

---

### Task 5: Add nav link

**Files:**
- Modify: `components/AppShell.tsx:56-61`

**Step 1: Add file icon to the icons object**

After the `'message-circle'` icon (around line 141), add:
```typescript
  'file-text': (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
```

**Step 2: Add Documents nav item to Admin section**

In the Admin nav section (line 57-60), add Documents between AI Chat and Settings:
```typescript
  {
    title: 'Admin',
    items: [
      { name: 'AI Chat', href: '/chat', icon: 'message-circle' },
      { name: 'Documents', href: '/documents', icon: 'file-text' },
      { name: 'Settings', href: '/settings', icon: 'settings' },
    ],
  },
```

**Step 3: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

**Step 4: Commit**
```bash
git add components/AppShell.tsx
git commit -m "feat: add Documents nav link in Admin section"
```

---

### Task 6: Create Baserow table and verify end-to-end

**Step 1: Create `documents` table in Baserow**

In the Baserow UI for the acre-ops database:
- Create table named `documents`
- Add fields: `name` (text), `file` (file), `description` (long text), `uploaded_by` (text), `uploaded_at` (date with time)
- Note the table ID from the URL

**Step 2: Update TABLE_IDS with actual ID**

Replace the placeholder in `lib/baserow.ts` with the real table ID.

**Step 3: Build and push**

```bash
npx next build
git add -A
git commit -m "feat: complete documents feature with Baserow table ID"
git push
```

**Step 4: Verify**

1. Navigate to Documents page from sidebar
2. Click Upload, add a PDF with a name — verify it appears in the list
3. Click the document name — verify it opens in a new tab
4. Click delete — verify it's removed
5. Test search — verify filtering works
6. Check on mobile — verify mobile cards render
