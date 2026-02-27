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

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Create row in documents table
    const payload: Record<string, unknown> = {
      name,
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
    };
    if (description) payload.description = description;

    // Upload file to Baserow storage (optional — notes don't have files)
    if (file) {
      const uploadedFile = await uploadFileToBaserow(file);
      if (!uploadedFile) {
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
      }
      payload.file = [{ name: uploadedFile.name }];
    }

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
