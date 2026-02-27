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
