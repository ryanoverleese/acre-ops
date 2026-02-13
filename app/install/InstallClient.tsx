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

interface InstallClientProps {
  probeAssignments: InstallableProbeAssignment[];
  probes: ProbeOption[];
  allAssignable: InstallableProbeAssignment[];
}

export default function InstallClient({ probeAssignments: initialAssignments, probes, allAssignable }: InstallClientProps) {
  const [probeAssignments, setProbeAssignments] = useState(initialAssignments);
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

  // Unique field names for the picker
  const pickerFields = useMemo(() => {
    const fieldNames = new Set(allAssignable.map(pa => pa.fieldName));
    return Array.from(fieldNames).sort();
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
          <h2>Install</h2>
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
                        {assignment.probeNumber > 1 && (
                          <span className="install-probe-number-suffix">
                            {' '}(Probe {assignment.probeNumber})
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
                          Probe {assignment.probeNumber}
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
      </div>

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
                  {pickerFields.map((name) => (
                    <option key={name} value={name}>{name}</option>
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
                            Probe {pa.probeNumber} — #{pa.probeSerial}
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
