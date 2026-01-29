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

    const probeAssignmentId = parseInt(formData.get('probeAssignmentId') as string, 10);
    const fieldSeasonId = parseInt(formData.get('fieldSeasonId') as string, 10);
    const installer = formData.get('installer') as string;
    const lat = parseFloat(formData.get('lat') as string);
    const lng = parseFloat(formData.get('lng') as string);
    const crop = formData.get('crop') as string;
    const changedProbeIdStr = formData.get('changedProbeId') as string | null;
    const changedProbeId = changedProbeIdStr ? parseInt(changedProbeIdStr, 10) : null;
    const cropxTelemetryId = formData.get('cropxTelemetryId') as string | null;
    const signalStrength = formData.get('signalStrength') as string | null;
    const installNotes = formData.get('installNotes') as string | null;
    const photoFieldEnd = formData.get('photoFieldEnd') as File | null;
    const photoExtra = formData.get('photoExtra') as File | null;

    if (!probeAssignmentId || isNaN(probeAssignmentId)) {
      return NextResponse.json({ error: 'Invalid probe assignment ID' }, { status: 400 });
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

    // Build the update data for probe_assignment
    const today = new Date().toISOString().split('T')[0];
    const probeAssignmentUpdate: Record<string, unknown> = {
      installer,
      install_date: today,
      install_lat: Math.round(lat * 1000000) / 1000000,
      install_lng: Math.round(lng * 1000000) / 1000000,
      probe_status: 'Installed',
    };

    // If installer grabbed wrong probe, update the probe link
    if (changedProbeId) {
      probeAssignmentUpdate.probe = [changedProbeId];
    }

    if (cropxTelemetryId) {
      probeAssignmentUpdate.cropx_telemetry_id = cropxTelemetryId;
    }
    if (signalStrength) {
      probeAssignmentUpdate.signal_strength = signalStrength;
    }
    if (installNotes) {
      probeAssignmentUpdate.install_notes = installNotes;
    }
    if (photoFieldEndFile) {
      probeAssignmentUpdate.install_photo_field_end_url = [{ name: photoFieldEndFile.name }];
    }
    if (photoExtraFile) {
      probeAssignmentUpdate.install_photo_extra_url = [{ name: photoExtraFile.name }];
    }

    console.log('Updating probe_assignment', probeAssignmentId, 'with install data:', JSON.stringify(probeAssignmentUpdate, null, 2));

    // Update the probe_assignment record
    const probeAssignmentUrl = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${probeAssignmentId}/?user_field_names=true`;
    console.log('PATCH URL:', probeAssignmentUrl);
    const probeAssignmentResponse = await fetch(probeAssignmentUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(probeAssignmentUpdate),
    });

    if (!probeAssignmentResponse.ok) {
      const errorText = await probeAssignmentResponse.text();
      console.error('Baserow API error updating probe_assignment:', probeAssignmentResponse.status, errorText);

      let errorMessage = 'Failed to log install';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = `Failed to log install: ${JSON.stringify(errorJson)}`;
      } catch {
        errorMessage = `Failed to log install: ${errorText}`;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: probeAssignmentResponse.status }
      );
    }

    const updatedProbeAssignment = await probeAssignmentResponse.json();
    console.log('Baserow response for probe_assignment update:', JSON.stringify(updatedProbeAssignment, null, 2));

    // Also update field_season with crop (shared between all probes in field)
    if (fieldSeasonId && !isNaN(fieldSeasonId) && crop) {
      const fieldSeasonUpdate: Record<string, unknown> = {
        crop,
        crop_confirmed: true,
      };

      const fieldSeasonUrl = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/${fieldSeasonId}/?user_field_names=true`;
      const fieldSeasonResponse = await fetch(fieldSeasonUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fieldSeasonUpdate),
      });

      if (!fieldSeasonResponse.ok) {
        console.error('Warning: Failed to update field_season crop, but install was recorded');
      }
    }

    return NextResponse.json({
      success: true,
      probeAssignment: updatedProbeAssignment,
    });
  } catch (error) {
    console.error('Error logging install:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
