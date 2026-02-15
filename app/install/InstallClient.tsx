'use client';

import { useState, useMemo } from 'react';
import type { ProbeOption } from './page';

// Target photo size: 2MB (compress anything larger)
const TARGET_PHOTO_SIZE_MB = 2;
const TARGET_PHOTO_SIZE_BYTES = TARGET_PHOTO_SIZE_MB * 1024 * 1024;

// Compress image using canvas
async function compressImage(file: File, maxSizeBytes: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Start with original dimensions
      let { width, height } = img;

      // If image is very large, scale it down
      const MAX_DIMENSION = 2048;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      // Try different quality levels until we get under target size
      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // If still too large and quality > 0.3, try lower quality
            if (blob.size > maxSizeBytes && quality > 0.3) {
              tryCompress(quality - 0.1);
            } else {
              // Create new file with compressed data
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            }
          },
          'image/jpeg',
          quality
        );
      };

      // Start with 0.8 quality
      tryCompress(0.8);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export interface InstallableProbeAssignment {
  id: number; // probe_assignment ID
  fieldSeasonId: number;
  fieldId: number;
  fieldName: string;
  operation: string;
  season: string;
  lat: number;
  lng: number;
  crop: string;
  routeOrder: number;
  plannedInstaller: string;
  probeNumber: number;
  label: string;
  probeId: number | null;
  probeSerial: string;
  probeBrand: string;
  probeRack: string;
  probeRackSlot: string;
  antennaType: string;
}

interface InstallFormData {
  installer: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null; // GPS accuracy in meters
  changedProbeId: number | null; // If installer grabbed wrong probe
  cropConfirmed: boolean;
  cropChanged: string;
  cropxTelemetryId: string;
  signalStrength: string;
  photoFieldEnd: File | null;
  photoExtra: File | null;
  installNotes: string;
}

const initialFormData: InstallFormData = {
  installer: '',
  lat: null,
  lng: null,
  accuracy: null,
  changedProbeId: null,
  cropConfirmed: false,
  cropChanged: '',
  cropxTelemetryId: '',
  signalStrength: '',
  photoFieldEnd: null,
  photoExtra: null,
  installNotes: '',
};

const INSTALLERS = ['Brian', 'Daine', 'Ryan', 'Ryan and Kasen'];
const CROPS = ['Corn', 'Soybeans', 'Seed Corn', 'Popcorn', 'Wheat', 'Sorghum'];

export interface InstalledProbeData {
  id: number;
  fieldSeasonId: number;
  fieldName: string;
  operation: string;
  probeNumber: number;
  label: string;
  probeSerial: string;
  probeBrand: string;
  crop: string;
  installer: string;
  installDate: string;
  installLat: number;
  installLng: number;
  cropxTelemetryId: string;
  signalStrength: string;
  installNotes: string;
  photoFieldEndUrl: string;
  photoExtraUrl: string;
}

interface EditInstallForm {
  installer: string;
  installDate: string;
  installLat: string;
  installLng: string;
  cropxTelemetryId: string;
  signalStrength: string;
  installNotes: string;
}

export interface OperationContact {
  name: string;
  email: string;
  phone: string;
}

interface InstallClientProps {
  probeAssignments: InstallableProbeAssignment[];
  probes: ProbeOption[];
  allAssignable: InstallableProbeAssignment[];
  installedProbes: InstalledProbeData[];
  operationContacts: Record<string, OperationContact[]>;
}

export default function InstallClient({ probeAssignments: initialAssignments, probes, allAssignable, installedProbes: initialInstalled, operationContacts }: InstallClientProps) {
  const [probeAssignments, setProbeAssignments] = useState(initialAssignments);
  const [installedProbes, setInstalledProbes] = useState(initialInstalled);
  const [installerFilter, setInstallerFilter] = useState<string>('all');
  const [selectedAssignment, setSelectedAssignment] = useState<InstallableProbeAssignment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<InstallFormData>(initialFormData);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCropChange, setShowCropChange] = useState(false);
  const [compressing, setCompressing] = useState<'photoFieldEnd' | 'photoExtra' | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerField, setPickerField] = useState<string>('');
  const [editingInstall, setEditingInstall] = useState<InstalledProbeData | null>(null);
  const [editForm, setEditForm] = useState<EditInstallForm>({ installer: '', installDate: '', installLat: '', installLng: '', cropxTelemetryId: '', signalStrength: '', installNotes: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [viewingInstall, setViewingInstall] = useState<InstalledProbeData | null>(null);
  const [editGettingLocation, setEditGettingLocation] = useState(false);
  const [sharingInstall, setSharingInstall] = useState<InstalledProbeData | null>(null);
  const [copied, setCopied] = useState(false);

  const handleEditInstall = (probe: InstalledProbeData) => {
    setEditingInstall(probe);
    setEditForm({
      installer: probe.installer,
      installDate: probe.installDate,
      installLat: probe.installLat ? String(probe.installLat) : '',
      installLng: probe.installLng ? String(probe.installLng) : '',
      cropxTelemetryId: probe.cropxTelemetryId,
      signalStrength: probe.signalStrength,
      installNotes: probe.installNotes,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingInstall) return;
    setSavingEdit(true);
    try {
      const update: Record<string, unknown> = {
        installer: editForm.installer,
        install_date: editForm.installDate,
        install_lat: editForm.installLat ? parseFloat(editForm.installLat) : null,
        install_lng: editForm.installLng ? parseFloat(editForm.installLng) : null,
        cropx_telemetry_id: editForm.cropxTelemetryId || null,
        signal_strength: editForm.signalStrength || null,
        install_notes: editForm.installNotes || null,
      };
      const response = await fetch(`/api/probe-assignments/${editingInstall.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (response.ok) {
        setInstalledProbes(prev => prev.map(p => p.id === editingInstall.id ? {
          ...p,
          installer: editForm.installer,
          installDate: editForm.installDate,
          installLat: editForm.installLat ? parseFloat(editForm.installLat) : 0,
          installLng: editForm.installLng ? parseFloat(editForm.installLng) : 0,
          cropxTelemetryId: editForm.cropxTelemetryId,
          signalStrength: editForm.signalStrength,
          installNotes: editForm.installNotes,
        } : p));
        setEditingInstall(null);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to save changes');
      }
    } catch {
      alert('Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteInstall = async () => {
    if (!editingInstall) return;
    if (!confirm(`Remove install data for ${editingInstall.fieldName} — #${editingInstall.probeSerial}? This will reset the probe status back to Assigned.`)) return;
    setSavingEdit(true);
    try {
      const update: Record<string, unknown> = {
        probe_status: 'Assigned',
        installer: '',
        install_date: null,
        install_lat: null,
        install_lng: null,
        cropx_telemetry_id: '',
        signal_strength: '',
        install_notes: '',
      };
      const response = await fetch(`/api/probe-assignments/${editingInstall.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (response.ok) {
        setInstalledProbes(prev => prev.filter(p => p.id !== editingInstall.id));
        setEditingInstall(null);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to remove install');
      }
    } catch {
      alert('Failed to remove install');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditGetLocation = () => {
    if (!navigator.geolocation) return;
    setEditGettingLocation(true);
    let bestPosition: GeolocationPosition | null = null;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }
      },
      () => { setEditGettingLocation(false); navigator.geolocation.clearWatch(watchId); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      if (bestPosition) {
        setEditForm(prev => ({
          ...prev,
          installLat: String(Math.round(bestPosition!.coords.latitude * 1000000) / 1000000),
          installLng: String(Math.round(bestPosition!.coords.longitude * 1000000) / 1000000),
        }));
      }
      setEditGettingLocation(false);
    }, 2000);
  };

  const buildShareMessage = (probe: InstalledProbeData, contactName?: string) => {
    const greeting = contactName ? `Hi ${contactName},` : 'Hi,';
    const dateStr = probe.installDate
      ? new Date(probe.installDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'recently';
    const probeLabel = probe.label ? ` (${probe.label})` : '';
    const mapsLink = probe.installLat && probe.installLng
      ? `\nhttps://www.google.com/maps?q=${probe.installLat},${probe.installLng}`
      : '';
    return `${greeting}\n\nYour soil moisture probe has been installed at ${probe.fieldName}${probeLabel}.\n\nProbe: #${probe.probeSerial} (${probe.probeBrand})\nInstalled: ${dateStr}\nInstaller: ${probe.installer || 'Acre Insights'}${mapsLink}\n\nWe'll be monitoring your field throughout the season. If you have any questions, don't hesitate to reach out!\n\n— Acre Insights`;
  };

  const handleCopyMessage = async (probe: InstalledProbeData, contactName?: string) => {
    const msg = buildShareMessage(probe, contactName);
    await navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Unique field names for the picker (with operation for display)
  const pickerFields = useMemo(() => {
    const fieldMap = new Map<string, string>();
    allAssignable.forEach(pa => {
      if (!fieldMap.has(pa.fieldName)) {
        fieldMap.set(pa.fieldName, pa.operation);
      }
    });
    return Array.from(fieldMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allAssignable]);

  // Probe assignments for the selected field in the picker
  const pickerAssignments = useMemo(() => {
    if (!pickerField) return [];
    return allAssignable.filter(pa => pa.fieldName === pickerField);
  }, [allAssignable, pickerField]);

  const handlePickerSelect = (assignment: InstallableProbeAssignment) => {
    setShowPicker(false);
    setPickerField('');
    handleLogInstall(assignment);
  };

  // Filter by planned installer
  const filteredAssignments = useMemo(() => {
    if (installerFilter === 'all') return probeAssignments;
    return probeAssignments.filter(pa => pa.plannedInstaller === installerFilter);
  }, [probeAssignments, installerFilter]);

  const handleLogInstall = (assignment: InstallableProbeAssignment) => {
    setSelectedAssignment(assignment);
    // Pre-fill installer from planned_installer if set
    setFormData({ ...initialFormData, installer: assignment.plannedInstaller || '' });
    setShowCropChange(false);
    setLocationError(null);
    setShowForm(true);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser');
      return;
    }

    setGettingLocation(true);
    setLocationError(null);

    // Use watchPosition to get multiple readings over 2 seconds and pick the most accurate
    let bestPosition: GeolocationPosition | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        // Keep the position with best (lowest) accuracy value
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }
      },
      (error) => {
        setLocationError(`Error getting location: ${error.message}`);
        setGettingLocation(false);
        navigator.geolocation.clearWatch(watchId);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // After 2 seconds, stop watching and use best position
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);

      if (bestPosition) {
        setFormData({
          ...formData,
          lat: Math.round(bestPosition.coords.latitude * 1000000) / 1000000,
          lng: Math.round(bestPosition.coords.longitude * 1000000) / 1000000,
          accuracy: bestPosition.coords.accuracy,
        });
      } else {
        setLocationError('Could not get GPS location. Please try again.');
      }
      setGettingLocation(false);
    }, 2000);
  };

  const handleConfirmCrop = () => {
    setFormData({ ...formData, cropConfirmed: true, cropChanged: '' });
    setShowCropChange(false);
  };

  const handleChangeCrop = (crop: string) => {
    setFormData({ ...formData, cropConfirmed: true, cropChanged: crop });
    setShowCropChange(false);
  };

  const handleFileChange = async (field: 'photoFieldEnd' | 'photoExtra', file: File | null) => {
    if (!file) {
      setFormData({ ...formData, [field]: null });
      return;
    }

    // If file is larger than target size, compress it
    if (file.size > TARGET_PHOTO_SIZE_BYTES) {
      setCompressing(field);
      try {
        const compressedFile = await compressImage(file, TARGET_PHOTO_SIZE_BYTES);
        setFormData(prev => ({ ...prev, [field]: compressedFile }));
      } catch (error) {
        console.error('Compression error:', error);
        // Fall back to original file if compression fails
        setFormData(prev => ({ ...prev, [field]: file }));
      } finally {
        setCompressing(null);
      }
    } else {
      setFormData({ ...formData, [field]: file });
    }
  };

  const handleSubmit = async () => {
    if (!selectedAssignment) return;

    if (!formData.installer) {
      alert('Please select an installer');
      return;
    }

    if (!formData.lat || !formData.lng) {
      alert('Please capture GPS location');
      return;
    }

    if (!formData.cropConfirmed) {
      alert('Please confirm or change the crop');
      return;
    }

    setSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append('probeAssignmentId', selectedAssignment.id.toString());
      submitData.append('fieldSeasonId', selectedAssignment.fieldSeasonId.toString());
      submitData.append('installer', formData.installer);
      submitData.append('lat', String(formData.lat));
      submitData.append('lng', String(formData.lng));
      submitData.append('crop', formData.cropChanged || selectedAssignment.crop);
      submitData.append('cropConfirmed', 'true');

      if (formData.changedProbeId) {
        submitData.append('changedProbeId', formData.changedProbeId.toString());
      }
      if (formData.cropxTelemetryId) {
        submitData.append('cropxTelemetryId', formData.cropxTelemetryId);
      }
      if (formData.signalStrength) {
        submitData.append('signalStrength', formData.signalStrength);
      }
      if (formData.installNotes) {
        submitData.append('installNotes', formData.installNotes);
      }
      if (formData.photoFieldEnd) {
        submitData.append('photoFieldEnd', formData.photoFieldEnd);
      }
      if (formData.photoExtra) {
        submitData.append('photoExtra', formData.photoExtra);
      }

      const response = await fetch('/api/install', {
        method: 'POST',
        body: submitData,
      });

      if (response.ok) {
        // Remove the installed assignment from the list
        setProbeAssignments(probeAssignments.filter(pa => pa.id !== selectedAssignment.id));
        setShowForm(false);
        setSelectedAssignment(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to log install');
      }
    } catch (error) {
      console.error('Install error:', error);
      alert('Failed to log install');
    } finally {
      setSubmitting(false);
    }
  };

  const isCropX = selectedAssignment?.probeBrand?.toLowerCase().includes('cropx');
  const isSentek = selectedAssignment?.probeBrand?.toLowerCase().includes('sentek');

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Installs</h2>
          <span className="season-badge">{filteredAssignments.length} Ready</span>
        </div>
        <div className="header-right">
          <select
            value={installerFilter}
            onChange={(e) => setInstallerFilter(e.target.value)}
            className="install-filter-select"
          >
            <option value="all">All Installers</option>
            {INSTALLERS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setShowPicker(true)}>
            Perform Install
          </button>
        </div>
      </header>

      <div className="content">
        {filteredAssignments.length === 0 ? (
          <div className="empty-state">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="install-empty-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="install-empty-title">All caught up!</h3>
            <p className="text-muted">
              {installerFilter !== 'all'
                ? `No installs assigned to ${installerFilter}.`
                : 'No probes ready for installation.'}
            </p>
          </div>
        ) : (
          <div className="install-list">
            {filteredAssignments.map((assignment) => (
              <div key={assignment.id} className="install-card">
                {/* Route Order Badge */}
                <div className="install-route-badge">
                  <span className="install-route-badge-label">Stop</span>
                  <span className="install-route-badge-number">
                    {assignment.routeOrder < 999 ? assignment.routeOrder : '—'}
                  </span>
                </div>

                {/* Card Content */}
                <div className="install-card-content">
                  {/* Header */}
                  <div className="install-card-header">
                    <div className="install-card-header-row">
                      <h3 className="install-field-name">
                        {assignment.fieldName}
                        {(assignment.probeNumber > 1 || assignment.label) && (
                          <span className="install-probe-number-suffix">
                            {' '}(Probe {assignment.probeNumber}{assignment.label ? ` — ${assignment.label}` : ''})
                          </span>
                        )}
                      </h3>
                      {assignment.plannedInstaller && (
                        <span className="install-installer-badge">
                          {assignment.plannedInstaller}
                        </span>
                      )}
                    </div>
                    <p className="install-operation">{assignment.operation}</p>
                    <div className="install-tags-row">
                      {assignment.crop && (
                        <span className="install-crop-tag">
                          {assignment.crop}
                        </span>
                      )}
                      {assignment.antennaType && (
                        <span className="install-antenna-tag">
                          {assignment.antennaType}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Probe Info */}
                  <div className="install-probe-info">
                    <div className="install-probe-info-row">
                      <div>
                        <span className="install-probe-label">
                          Probe {assignment.probeNumber}{assignment.label ? ` — ${assignment.label}` : ''}
                        </span>
                        <div className="install-probe-serial">
                          #{assignment.probeSerial}
                        </div>
                      </div>
                      {assignment.probeRack && (
                        <div className="install-rack-info">
                          <span className="install-rack-label">Rack</span>
                          <div className="install-rack-value">{assignment.probeRack}{assignment.probeRackSlot ? `-${assignment.probeRackSlot}` : ''}</div>
                        </div>
                      )}
                    </div>
                    <button
                      className="btn btn-primary install-btn-full"
                      onClick={() => handleLogInstall(assignment)}
                    >
                      Log Install
                    </button>
                  </div>

                  {/* Navigate Button */}
                  {assignment.lat !== 0 && assignment.lng !== 0 && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${assignment.lat},${assignment.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary install-navigate-btn"
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Navigate
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Installed Probes Section */}
        {installedProbes.length > 0 && (
          <div className="table-container" style={{ marginTop: 24 }}>
            <div className="table-header">
              <h3 className="table-title">
                Installed
                <span className="season-badge" style={{ marginLeft: 8 }}>{installedProbes.length}</span>
              </h3>
            </div>
            <table className="desktop-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Probe</th>
                  <th>Installer</th>
                  <th>Date</th>
                  <th>GPS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {installedProbes.map((probe) => (
                  <tr key={probe.id}>
                    <td>
                      <div>{probe.fieldName}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{probe.operation}</div>
                    </td>
                    <td>
                      <span className="text-secondary">#{probe.probeSerial}</span>
                      {(probe.probeNumber > 1 || probe.label) && <span className="text-muted" style={{ fontSize: 12 }}> (P{probe.probeNumber}{probe.label ? ` — ${probe.label}` : ''})</span>}
                    </td>
                    <td><span className="text-secondary">{probe.installer || '—'}</span></td>
                    <td><span className="text-secondary">{probe.installDate ? new Date(probe.installDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span></td>
                    <td>
                      {probe.installLat && probe.installLng ? (
                        <a
                          href={`https://www.google.com/maps?q=${probe.installLat},${probe.installLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary"
                          style={{ textDecoration: 'underline' }}
                        >
                          {Number(probe.installLat).toFixed(4)}, {Number(probe.installLng).toFixed(4)}
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setViewingInstall(probe)}>
                          View
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => handleEditInstall(probe)}>
                          Edit
                        </button>
                        <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setSharingInstall(probe)}>
                          Notify
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile card view */}
            <div className="installed-mobile-list">
              {installedProbes.map((probe) => (
                <div key={probe.id} className="installed-mobile-card" onClick={() => setViewingInstall(probe)}>
                  <div className="installed-mobile-card-top">
                    <div>
                      <div style={{ fontWeight: 600 }}>{probe.fieldName}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        #{probe.probeSerial}
                        {(probe.probeNumber > 1 || probe.label) && ` (P${probe.probeNumber}${probe.label ? ` — ${probe.label}` : ''})`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13 }}>
                      <div className="text-secondary">{probe.installer || '—'}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{probe.installDate ? new Date(probe.installDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</div>
                    </div>
                  </div>
                  <div className="installed-mobile-card-actions">
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, flex: 1 }} onClick={(e) => { e.stopPropagation(); setViewingInstall(probe); }}>
                      View
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, flex: 1 }} onClick={(e) => { e.stopPropagation(); handleEditInstall(probe); }}>
                      Edit
                    </button>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12, flex: 1 }} onClick={(e) => { e.stopPropagation(); setSharingInstall(probe); }}>
                      Notify
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* View Install Detail Modal */}
      {viewingInstall && (
        <div className="detail-panel-overlay" onClick={() => setViewingInstall(null)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <div>
                <h3>{viewingInstall.fieldName}</h3>
                <p className="text-muted">#{viewingInstall.probeSerial} — {viewingInstall.operation}</p>
              </div>
              <button className="close-btn" onClick={() => setViewingInstall(null)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="detail-section">
                <div className="detail-row"><span className="detail-label">Installer</span><span className="detail-value">{viewingInstall.installer || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Install Date</span><span className="detail-value">{viewingInstall.installDate || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Crop</span><span className="detail-value">{viewingInstall.crop || '—'}</span></div>
                <div className="detail-row">
                  <span className="detail-label">GPS</span>
                  <span className="detail-value">
                    {viewingInstall.installLat && viewingInstall.installLng ? (
                      <a href={`https://www.google.com/maps?q=${viewingInstall.installLat},${viewingInstall.installLng}`} target="_blank" rel="noopener noreferrer">
                        {Number(viewingInstall.installLat).toFixed(6)}, {Number(viewingInstall.installLng).toFixed(6)}
                      </a>
                    ) : '—'}
                  </span>
                </div>
                {viewingInstall.cropxTelemetryId && <div className="detail-row"><span className="detail-label">CropX Telemetry ID</span><span className="detail-value">{viewingInstall.cropxTelemetryId}</span></div>}
                {viewingInstall.signalStrength && <div className="detail-row"><span className="detail-label">Signal Strength</span><span className="detail-value">{viewingInstall.signalStrength}</span></div>}
                {viewingInstall.installNotes && <div className="detail-row"><span className="detail-label">Notes</span><span className="detail-value">{viewingInstall.installNotes}</span></div>}
                {viewingInstall.photoFieldEndUrl && (
                  <div className="detail-row">
                    <span className="detail-label">Photo - Field End</span>
                    <span className="detail-value"><a href={viewingInstall.photoFieldEndUrl} target="_blank" rel="noopener noreferrer">View Photo</a></span>
                  </div>
                )}
                {viewingInstall.photoExtraUrl && (
                  <div className="detail-row">
                    <span className="detail-label">Photo - Extra</span>
                    <span className="detail-value"><a href={viewingInstall.photoExtraUrl} target="_blank" rel="noopener noreferrer">View Photo</a></span>
                  </div>
                )}
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setViewingInstall(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setViewingInstall(null); handleEditInstall(viewingInstall); }}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Install Modal */}
      {editingInstall && (
        <div className="detail-panel-overlay" onClick={() => setEditingInstall(null)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <div>
                <h3>Edit Install</h3>
                <p className="text-muted">{editingInstall.fieldName} — #{editingInstall.probeSerial}</p>
              </div>
              <button className="close-btn" onClick={() => setEditingInstall(null)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Installer</label>
                  <select value={editForm.installer} onChange={(e) => setEditForm({ ...editForm, installer: e.target.value })} className="install-form-input">
                    <option value="">Select installer...</option>
                    {INSTALLERS.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Install Date</label>
                  <input type="date" value={editForm.installDate} onChange={(e) => setEditForm({ ...editForm, installDate: e.target.value })} className="install-form-input" />
                </div>
                <div className="form-group">
                  <label>GPS Coordinates</label>
                  <button
                    className="btn btn-secondary"
                    onClick={handleEditGetLocation}
                    disabled={editGettingLocation}
                    style={{ marginBottom: 8, width: '100%' }}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {editGettingLocation ? 'Getting Location...' : 'Use Current Location'}
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={editForm.installLat} onChange={(e) => setEditForm({ ...editForm, installLat: e.target.value })} className="install-form-input" placeholder="Latitude" />
                    <input type="text" value={editForm.installLng} onChange={(e) => setEditForm({ ...editForm, installLng: e.target.value })} className="install-form-input" placeholder="Longitude" />
                  </div>
                </div>
                <div className="form-group">
                  <label>CropX Telemetry ID</label>
                  <input type="text" value={editForm.cropxTelemetryId} onChange={(e) => setEditForm({ ...editForm, cropxTelemetryId: e.target.value })} className="install-form-input" />
                </div>
                <div className="form-group">
                  <label>Signal Strength</label>
                  <input type="text" value={editForm.signalStrength} onChange={(e) => setEditForm({ ...editForm, signalStrength: e.target.value })} className="install-form-input" />
                </div>
                <div className="form-group">
                  <label>Install Notes</label>
                  <textarea value={editForm.installNotes} onChange={(e) => setEditForm({ ...editForm, installNotes: e.target.value })} rows={3} className="install-form-input" />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-danger" onClick={handleDeleteInstall} disabled={savingEdit}>Remove Install</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setEditingInstall(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share / Notify Grower Modal */}
      {sharingInstall && (() => {
        const contacts = operationContacts[sharingInstall.operation] || [];
        const dateStr = sharingInstall.installDate
          ? new Date(sharingInstall.installDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : 'recently';
        const probeLabel = sharingInstall.label ? ` (${sharingInstall.label})` : '';

        return (
          <div className="detail-panel-overlay" onClick={() => { setSharingInstall(null); setCopied(false); }}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="detail-panel-header">
                <div>
                  <h3>Notify Grower</h3>
                  <p className="text-muted">{sharingInstall.fieldName}{probeLabel} — #{sharingInstall.probeSerial}</p>
                </div>
                <button className="close-btn" onClick={() => { setSharingInstall(null); setCopied(false); }}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                {/* Install Summary Card */}
                <div className="share-install-summary">
                  <div className="share-install-summary-row">
                    <span className="share-install-summary-icon">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{sharingInstall.fieldName}{probeLabel}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{sharingInstall.operation}</div>
                    </div>
                  </div>
                  <div className="share-install-details">
                    <div className="share-install-detail"><span className="text-muted">Probe</span><span>#{sharingInstall.probeSerial} ({sharingInstall.probeBrand})</span></div>
                    <div className="share-install-detail"><span className="text-muted">Installed</span><span>{dateStr}</span></div>
                    <div className="share-install-detail"><span className="text-muted">Installer</span><span>{sharingInstall.installer || '—'}</span></div>
                    {sharingInstall.installLat && sharingInstall.installLng && (
                      <div className="share-install-detail">
                        <span className="text-muted">Location</span>
                        <a href={`https://www.google.com/maps?q=${sharingInstall.installLat},${sharingInstall.installLng}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>
                          View on Map
                        </a>
                      </div>
                    )}
                    {sharingInstall.crop && <div className="share-install-detail"><span className="text-muted">Crop</span><span>{sharingInstall.crop}</span></div>}
                  </div>
                </div>

                {/* Contacts */}
                {contacts.length > 0 ? (
                  <div className="share-contacts-section">
                    <div className="share-contacts-label">Grower Contacts</div>
                    {contacts.map((contact, i) => (
                      <div key={i} className="share-contact-card">
                        <div className="share-contact-info">
                          <div style={{ fontWeight: 500 }}>{contact.name}</div>
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {contact.email && contact.phone ? `${contact.email} · ${contact.phone}` : contact.email || contact.phone}
                          </div>
                        </div>
                        <div className="share-contact-actions">
                          {contact.phone && (
                            <a
                              href={`sms:${contact.phone}?body=${encodeURIComponent(buildShareMessage(sharingInstall, contact.name))}`}
                              className="btn btn-primary share-action-btn"
                              title="Send text"
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                              Text
                            </a>
                          )}
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}?subject=${encodeURIComponent(`Probe Installed — ${sharingInstall.fieldName}`)}&body=${encodeURIComponent(buildShareMessage(sharingInstall, contact.name))}`}
                              className="btn btn-secondary share-action-btn"
                              title="Send email"
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              Email
                            </a>
                          )}
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="btn btn-secondary share-action-btn"
                              title="Call"
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              Call
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="share-contacts-section">
                    <div className="share-contacts-label">Grower Contacts</div>
                    <p className="text-muted" style={{ fontSize: 13, padding: '8px 0' }}>
                      No &quot;Probe&quot; type contacts found for {sharingInstall.operation}. Add contacts with the &quot;Probe&quot; customer type in CRM.
                    </p>
                  </div>
                )}

                {/* Copy Message */}
                <div className="share-copy-section">
                  <div className="share-contacts-label">Message Preview</div>
                  <pre className="share-message-preview">{buildShareMessage(sharingInstall)}</pre>
                  <button
                    className={`btn ${copied ? 'btn-primary' : 'btn-secondary'} share-copy-btn`}
                    onClick={() => handleCopyMessage(sharingInstall)}
                  >
                    {copied ? (
                      <>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        Copy Message
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Perform Install Picker Modal */}
      {showPicker && (
        <div className="detail-panel-overlay" onClick={() => { setShowPicker(false); setPickerField(''); }}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Perform Install</h3>
              <button className="close-btn" onClick={() => { setShowPicker(false); setPickerField(''); }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="form-group">
                <label>Select Field</label>
                <select
                  value={pickerField}
                  onChange={(e) => setPickerField(e.target.value)}
                  className="install-form-input"
                >
                  <option value="">Choose a field...</option>
                  {pickerFields.map(([name, operation]) => (
                    <option key={name} value={name}>{name} — {operation}</option>
                  ))}
                </select>
              </div>

              {pickerField && pickerAssignments.length > 0 && (
                <div className="form-group">
                  <label>Select Probe Assignment</label>
                  <div className="install-picker-list">
                    {pickerAssignments.map((pa) => (
                      <button
                        key={pa.id}
                        className="install-picker-item"
                        onClick={() => handlePickerSelect(pa)}
                      >
                        <div className="install-picker-item-main">
                          <span className="install-picker-item-name">
                            Probe {pa.probeNumber}{pa.label ? ` — ${pa.label}` : ''} — #{pa.probeSerial}
                          </span>
                          <span className="install-picker-item-meta">
                            {pa.operation} {pa.crop ? `• ${pa.crop}` : ''}
                          </span>
                        </div>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pickerField && pickerAssignments.length === 0 && (
                <p className="text-muted">No probe assignments available for this field.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Install Form Modal */}
      {showForm && selectedAssignment && (
        <div className="detail-panel-overlay" onClick={() => setShowForm(false)}>
          <div
            className="detail-panel install-form-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="detail-panel-header">
              <div>
                <h3 className="install-form-title">Log Install</h3>
                <p className="install-form-subtitle">
                  {selectedAssignment.fieldName} - #{selectedAssignment.probeSerial}
                </p>
              </div>
              <button className="close-btn" onClick={() => setShowForm(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="detail-panel-content">
              <div className="edit-form">
                {/* Probe - with option to change if wrong one grabbed */}
                <div className="form-group">
                  <label>Probe</label>
                  {!formData.changedProbeId ? (
                    <div className="install-probe-display">
                      <span className="install-probe-display-serial">
                        #{selectedAssignment.probeSerial}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, changedProbeId: -1 })}
                        className="install-link-btn"
                      >
                        Wrong probe?
                      </button>
                    </div>
                  ) : (
                    <div>
                      <select
                        value={formData.changedProbeId === -1 ? '' : formData.changedProbeId}
                        onChange={(e) => setFormData({ ...formData, changedProbeId: e.target.value ? parseInt(e.target.value, 10) : null })}
                        className="install-form-input-full"
                      >
                        <option value="">Select the actual probe...</option>
                        {probes.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.serialNumber} {p.rack ? `(${p.rack}${p.rackSlot ? `-${p.rackSlot}` : ''})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, changedProbeId: null })}
                        className="install-link-btn-muted"
                      >
                        Cancel - use original probe
                      </button>
                    </div>
                  )}
                </div>

                {/* Installer */}
                <div className="form-group">
                  <label>Installer *</label>
                  <select
                    value={formData.installer}
                    onChange={(e) => setFormData({ ...formData, installer: e.target.value })}
                    className="install-form-input"
                  >
                    <option value="">Select installer...</option>
                    {INSTALLERS.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* GPS */}
                <div className="form-group">
                  <label>GPS Location *</label>
                  <button
                    type="button"
                    className="btn btn-secondary install-gps-btn"
                    onClick={handleGetLocation}
                    disabled={gettingLocation}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {gettingLocation ? 'Getting Location...' : 'Capture GPS Location'}
                  </button>
                  {formData.lat && formData.lng && (
                    <div className="install-gps-result">
                      <div>
                        {formData.lat}, {formData.lng}
                      </div>
                      {formData.accuracy && (
                        <div className="install-gps-accuracy">
                          Accuracy: ±{Math.round(formData.accuracy * 3.28084)} feet ({Math.round(formData.accuracy)}m)
                        </div>
                      )}
                    </div>
                  )}
                  {locationError && (
                    <div className="install-gps-error">
                      {locationError}
                    </div>
                  )}
                </div>

                {/* Crop Confirmation */}
                <div className="form-group">
                  <label>Crop *</label>
                  {!formData.cropConfirmed ? (
                    <div className="install-crop-actions">
                      <button
                        type="button"
                        className="btn btn-primary install-crop-confirm-btn"
                        onClick={handleConfirmCrop}
                      >
                        Confirm: {selectedAssignment.crop || 'Unknown'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary install-crop-change-btn"
                        onClick={() => setShowCropChange(true)}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="install-crop-confirmed">
                      <span>{formData.cropChanged || selectedAssignment.crop}</span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, cropConfirmed: false })}
                        className="install-link-btn-primary"
                      >
                        Change
                      </button>
                    </div>
                  )}
                  {showCropChange && (
                    <div className="install-crop-options">
                      {CROPS.map((crop) => (
                        <button
                          key={crop}
                          type="button"
                          className="btn btn-secondary install-crop-option-btn"
                          onClick={() => handleChangeCrop(crop)}
                        >
                          {crop}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* CropX Telemetry ID - only for CropX Gateway */}
                {isCropX && (
                  <div className="form-group">
                    <label>CropX Telemetry ID</label>
                    <p className="install-helper-text">
                      Only needed for CropX gateway boxes
                    </p>
                    <input
                      type="text"
                      value={formData.cropxTelemetryId}
                      onChange={(e) => setFormData({ ...formData, cropxTelemetryId: e.target.value })}
                      placeholder="Enter telemetry ID"
                      className="install-form-input"
                    />
                  </div>
                )}

                {/* Signal Strength - only for Sentek Gateway */}
                {isSentek && (
                  <div className="form-group">
                    <label>Signal Strength</label>
                    <input
                      type="text"
                      value={formData.signalStrength}
                      onChange={(e) => setFormData({ ...formData, signalStrength: e.target.value })}
                      placeholder="Enter signal strength"
                      className="install-form-input"
                    />
                  </div>
                )}

                {/* Photo Field End */}
                <div className="form-group">
                  <label>Photo - Field End</label>
                  <p className="install-helper-text">
                    Stand at probe and take a picture toward the end of the field
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFileChange('photoFieldEnd', e.target.files?.[0] || null)}
                    className="install-file-input"
                    disabled={compressing === 'photoFieldEnd'}
                  />
                  {compressing === 'photoFieldEnd' && (
                    <div className="install-photo-status install-photo-status-compressing">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" className="install-spin-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Compressing photo...</span>
                    </div>
                  )}
                  {formData.photoFieldEnd && !compressing && (
                    <div className="install-photo-status install-photo-status-ready">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Photo ready ({(formData.photoFieldEnd.size / 1024 / 1024).toFixed(1)}MB)</span>
                    </div>
                  )}
                </div>

                {/* Photo Extra */}
                <div className="form-group">
                  <label>Photo - Extra (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFileChange('photoExtra', e.target.files?.[0] || null)}
                    className="install-file-input"
                    disabled={compressing === 'photoExtra'}
                  />
                  {compressing === 'photoExtra' && (
                    <div className="install-photo-status install-photo-status-compressing">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" className="install-spin-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Compressing photo...</span>
                    </div>
                  )}
                  {formData.photoExtra && !compressing && (
                    <div className="install-photo-status install-photo-status-ready">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Photo ready ({(formData.photoExtra.size / 1024 / 1024).toFixed(1)}MB)</span>
                    </div>
                  )}
                </div>

                {/* Install Notes */}
                <div className="form-group">
                  <label>Install Notes</label>
                  <textarea
                    value={formData.installNotes}
                    onChange={(e) => setFormData({ ...formData, installNotes: e.target.value })}
                    placeholder="Anything out of the ordinary..."
                    rows={3}
                    className="install-form-input"
                  />
                </div>
              </div>
            </div>

            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary install-submit-btn"
                onClick={handleSubmit}
                disabled={submitting || compressing !== null}
              >
                {submitting ? 'Submitting...' : compressing ? 'Compressing...' : 'Submit Install'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
