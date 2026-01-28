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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const fieldSeasonId = parseInt(formData.get('fieldSeasonId') as string, 10);
    const probeNum = parseInt(formData.get('probeNum') as string, 10);
    const installer = formData.get('installer') as string;
    const lat = parseFloat(formData.get('lat') as string);
    const lng = parseFloat(formData.get('lng') as string);
    const crop = formData.get('crop') as string;
    const cropxTelemetryId = formData.get('cropxTelemetryId') as string | null;
    const signalStrength = formData.get('signalStrength') as string | null;
    const installNotes = formData.get('installNotes') as string | null;
    const photoFieldEnd = formData.get('photoFieldEnd') as File | null;
    const photoExtra = formData.get('photoExtra') as File | null;

    if (!fieldSeasonId || isNaN(fieldSeasonId)) {
      return NextResponse.json({ error: 'Invalid field season ID' }, { status: 400 });
    }

    if (!installer) {
      return NextResponse.json({ error: 'Installer is required' }, { status: 400 });
    }

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'GPS location is required' }, { status: 400 });
    }

    // Upload photos if provided
    let photoFieldEndFile: BaserowFile | null = null;
    let photoExtraFile: BaserowFile | null = null;

    if (photoFieldEnd && photoFieldEnd.size > 0) {
      photoFieldEndFile = await uploadFileToBaserow(photoFieldEnd);
    }

    if (photoExtra && photoExtra.size > 0) {
      photoExtraFile = await uploadFileToBaserow(photoExtra);
    }

    // Build the update data based on probe number
    const today = new Date().toISOString().split('T')[0];
    const updateData: Record<string, unknown> = {};

    if (probeNum === 1) {
      updateData.installer = installer;
      updateData.install_date = today;
      updateData.install_lat = Math.round(lat * 1000000) / 1000000;
      updateData.install_lng = Math.round(lng * 1000000) / 1000000;
      updateData.probe_status = 'Installed';
      updateData.crop = crop;
      updateData.crop_confirmed = true;

      if (cropxTelemetryId) {
        updateData.cropx_telemetry_id = cropxTelemetryId;
      }
      if (signalStrength) {
        updateData.signal_strength = signalStrength;
      }
      if (installNotes) {
        updateData.install_notes = installNotes;
      }
      if (photoFieldEndFile) {
        updateData.install_photo_field_end_url = [{ name: photoFieldEndFile.name }];
      }
      if (photoExtraFile) {
        updateData.install_photo_extra_url = [{ name: photoExtraFile.name }];
      }
    } else {
      // Probe 2
      updateData.probe_2_installer = installer;
      updateData.probe_2_install_date = today;
      updateData.probe_2_install_lat = Math.round(lat * 1000000) / 1000000;
      updateData.probe_2_install_lng = Math.round(lng * 1000000) / 1000000;
      updateData.probe_2_status = 'Installed';
      // Crop is shared between probes
      updateData.crop = crop;
      updateData.crop_confirmed = true;

      if (cropxTelemetryId) {
        updateData.probe_2_cropx_telemetry_id = cropxTelemetryId;
      }
      if (signalStrength) {
        updateData.probe_2_signal_strength = signalStrength;
      }
      if (installNotes) {
        updateData.probe_2_install_notes = installNotes;
      }
      if (photoFieldEndFile) {
        updateData.probe_2_install_photo_field_end_url = [{ name: photoFieldEndFile.name }];
      }
      if (photoExtraFile) {
        updateData.probe_2_install_photo_extra_url = [{ name: photoExtraFile.name }];
      }
    }

    console.log('Updating field season with install data:', JSON.stringify(updateData, null, 2));

    // Update the field_season record
    const url = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/${fieldSeasonId}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error updating field_season:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to log install' },
        { status: response.status }
      );
    }

    const updatedFieldSeason = await response.json();

    return NextResponse.json({
      success: true,
      fieldSeason: updatedFieldSeason,
    });
  } catch (error) {
    console.error('Error logging install:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
