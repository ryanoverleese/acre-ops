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

export interface InstallableField {
  id: number;
  fieldId: number;
  fieldName: string;
  operation: string;
  season: string;
  lat: number;
  lng: number;
  crop: string;
  antennaType: string;
  // Install planning
  routeOrder: number;
  plannedInstaller: string;
  // Probe 1
  probe1Serial: string;
  probe1Brand: string;
  probe1RackLocation: string;
  probe1Status: string;
  probe1NeedsInstall: boolean;
  // Probe 2
  probe2Serial: string;
  probe2Brand: string;
  probe2RackLocation: string;
  probe2Status: string;
  probe2NeedsInstall: boolean;
  hasProbe2: boolean;
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
  fields: InstallableField[];
  probes: ProbeOption[];
}

export default function InstallClient({ fields: initialFields, probes }: InstallClientProps) {
  const [fields, setFields] = useState(initialFields);
  const [installerFilter, setInstallerFilter] = useState<string>('all');
  const [selectedField, setSelectedField] = useState<InstallableField | null>(null);
  const [selectedProbe, setSelectedProbe] = useState<1 | 2>(1);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<InstallFormData>(initialFormData);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCropChange, setShowCropChange] = useState(false);
  const [compressing, setCompressing] = useState<'photoFieldEnd' | 'photoExtra' | null>(null);

  // Filter by planned installer
  const filteredFields = useMemo(() => {
    if (installerFilter === 'all') return fields;
    return fields.filter(f => f.plannedInstaller === installerFilter);
  }, [fields, installerFilter]);

  const handleLogInstall = (field: InstallableField, probeNum: 1 | 2) => {
    setSelectedField(field);
    setSelectedProbe(probeNum);
    // Pre-fill installer from planned_installer if set
    setFormData({ ...initialFormData, installer: field.plannedInstaller || '' });
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
    if (!selectedField) return;

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
      submitData.append('fieldSeasonId', selectedField.id.toString());
      submitData.append('probeNum', selectedProbe.toString());
      submitData.append('installer', formData.installer);
      submitData.append('lat', String(formData.lat));
      submitData.append('lng', String(formData.lng));
      submitData.append('crop', formData.cropChanged || selectedField.crop);
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
        // Remove or update the field from the list
        if (selectedProbe === 1) {
          if (selectedField.hasProbe2 && selectedField.probe2NeedsInstall) {
            // Still has probe 2 to install
            setFields(fields.map(f =>
              f.id === selectedField.id
                ? { ...f, probe1NeedsInstall: false, probe1Status: 'installed' }
                : f
            ));
          } else {
            // Remove from list
            setFields(fields.filter(f => f.id !== selectedField.id));
          }
        } else {
          if (selectedField.probe1NeedsInstall) {
            // Still has probe 1 to install
            setFields(fields.map(f =>
              f.id === selectedField.id
                ? { ...f, probe2NeedsInstall: false, probe2Status: 'installed' }
                : f
            ));
          } else {
            // Remove from list
            setFields(fields.filter(f => f.id !== selectedField.id));
          }
        }

        setShowForm(false);
        setSelectedField(null);
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

  const probeBrand = selectedProbe === 1 ? selectedField?.probe1Brand : selectedField?.probe2Brand;
  const isCropX = probeBrand?.toLowerCase().includes('cropx');
  const isSentek = probeBrand?.toLowerCase().includes('sentek');

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Install</h2>
          <span className="season-badge">{filteredFields.length} Ready</span>
        </div>
        <div className="header-right">
          <select
            value={installerFilter}
            onChange={(e) => setInstallerFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px' }}
          >
            <option value="all">All Installers</option>
            {INSTALLERS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="content">
        {filteredFields.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 48, height: 48, color: 'var(--text-muted)', marginBottom: 16 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>All caught up!</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              {installerFilter !== 'all'
                ? `No installs assigned to ${installerFilter}.`
                : 'No probes ready for installation.'}
            </p>
          </div>
        ) : (
          <div className="install-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredFields.map((field) => (
              <div key={field.id} className="install-card" style={{
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid var(--border)',
                display: 'flex',
              }}>
                {/* Route Order Badge */}
                <div style={{
                  width: '60px',
                  minWidth: '60px',
                  background: 'var(--accent-blue)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  padding: '12px 0',
                }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8 }}>Stop</span>
                  <span style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1 }}>
                    {field.routeOrder < 999 ? field.routeOrder : '—'}
                  </span>
                </div>

                {/* Card Content */}
                <div style={{ flex: 1 }}>
                  {/* Header */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{field.fieldName}</h3>
                      {field.plannedInstaller && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: 'var(--accent-amber-dim)',
                          color: 'var(--accent-amber)',
                          borderRadius: '4px',
                          fontWeight: 500,
                        }}>
                          {field.plannedInstaller}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>{field.operation}</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {field.crop && (
                        <span style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          background: 'var(--accent-green-dim)',
                          color: 'var(--accent-green)',
                          borderRadius: '4px',
                        }}>
                          {field.crop}
                        </span>
                      )}
                      {field.antennaType && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                        }}>
                          {field.antennaType}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Probe 1 */}
                  {field.probe1Serial && (
                    <div style={{ padding: '12px 16px', borderBottom: field.hasProbe2 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {field.hasProbe2 ? 'Probe 1' : 'Probe'}
                          </span>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '15px', fontWeight: 500 }}>
                            #{field.probe1Serial}
                          </div>
                        </div>
                        {field.probe1RackLocation && (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rack</span>
                            <div style={{ fontSize: '14px', fontWeight: 500 }}>{field.probe1RackLocation}</div>
                          </div>
                        )}
                      </div>
                      {field.probe1NeedsInstall ? (
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                          onClick={() => handleLogInstall(field, 1)}
                        >
                          Log Install
                        </button>
                      ) : (
                        <div style={{
                          padding: '8px',
                          background: 'var(--accent-green-dim)',
                          borderRadius: '8px',
                          textAlign: 'center',
                          color: 'var(--accent-green)',
                          fontSize: '14px',
                        }}>
                          Installed
                        </div>
                      )}
                    </div>
                  )}

                  {/* Probe 2 */}
                  {field.hasProbe2 && field.probe2Serial && (
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Probe 2</span>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '15px', fontWeight: 500 }}>
                            #{field.probe2Serial}
                          </div>
                        </div>
                        {field.probe2RackLocation && (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rack</span>
                            <div style={{ fontSize: '14px', fontWeight: 500 }}>{field.probe2RackLocation}</div>
                          </div>
                        )}
                      </div>
                      {field.probe2NeedsInstall ? (
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                          onClick={() => handleLogInstall(field, 2)}
                        >
                          Log Install
                        </button>
                      ) : (
                        <div style={{
                          padding: '8px',
                          background: 'var(--accent-green-dim)',
                          borderRadius: '8px',
                          textAlign: 'center',
                          color: 'var(--accent-green)',
                          fontSize: '14px',
                        }}>
                          Installed
                        </div>
                      )}
                    </div>
                  )}

                  {/* Navigate Button */}
                  {field.lat !== 0 && field.lng !== 0 && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${field.lat},${field.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '8px',
                        margin: '0 16px 16px',
                        padding: '12px',
                        borderRadius: '8px',
                      }}
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

      {/* Install Form Modal */}
      {showForm && selectedField && (
        <div className="detail-panel-overlay" onClick={() => setShowForm(false)}>
          <div
            className="detail-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflow: 'auto' }}
          >
            <div className="detail-panel-header">
              <div>
                <h3 style={{ marginBottom: '4px' }}>Log Install</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  {selectedField.fieldName} - #{selectedProbe === 1 ? selectedField.probe1Serial : selectedField.probe2Serial}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                        #{selectedProbe === 1 ? selectedField.probe1Serial : selectedField.probe2Serial}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, changedProbeId: -1 })}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '13px' }}
                      >
                        Wrong probe?
                      </button>
                    </div>
                  ) : (
                    <div>
                      <select
                        value={formData.changedProbeId === -1 ? '' : formData.changedProbeId}
                        onChange={(e) => setFormData({ ...formData, changedProbeId: e.target.value ? parseInt(e.target.value, 10) : null })}
                        style={{ fontSize: '16px', padding: '12px', width: '100%' }}
                      >
                        <option value="">Select the actual probe...</option>
                        {probes.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.serialNumber} {p.rackLocation ? `(${p.rackLocation})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, changedProbeId: null })}
                        style={{ marginTop: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}
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
                    style={{ fontSize: '16px', padding: '12px' }}
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
                    className="btn btn-secondary"
                    onClick={handleGetLocation}
                    disabled={gettingLocation}
                    style={{ width: '100%', justifyContent: 'center', padding: '14px', marginBottom: '8px' }}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {gettingLocation ? 'Getting Location...' : 'Capture GPS Location'}
                  </button>
                  {formData.lat && formData.lng && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--accent-green-dim)',
                      borderRadius: '8px',
                      color: 'var(--accent-green)',
                      fontSize: '14px',
                    }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {formData.lat}, {formData.lng}
                      </div>
                      {formData.accuracy && (
                        <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                          Accuracy: ±{Math.round(formData.accuracy * 3.28084)} feet ({Math.round(formData.accuracy)}m)
                        </div>
                      )}
                    </div>
                  )}
                  {locationError && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--accent-red-dim)',
                      borderRadius: '8px',
                      color: 'var(--accent-red)',
                      fontSize: '14px',
                    }}>
                      {locationError}
                    </div>
                  )}
                </div>

                {/* Crop Confirmation */}
                <div className="form-group">
                  <label>Crop *</label>
                  {!formData.cropConfirmed ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleConfirmCrop}
                        style={{ flex: 1, justifyContent: 'center', padding: '14px' }}
                      >
                        Confirm: {selectedField.crop || 'Unknown'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowCropChange(true)}
                        style={{ padding: '14px' }}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '12px',
                      background: 'var(--accent-green-dim)',
                      borderRadius: '8px',
                      color: 'var(--accent-green)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span>{formData.cropChanged || selectedField.crop}</span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, cropConfirmed: false })}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-green)', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Change
                      </button>
                    </div>
                  )}
                  {showCropChange && (
                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {CROPS.map((crop) => (
                        <button
                          key={crop}
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleChangeCrop(crop)}
                          style={{ padding: '10px 16px' }}
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
                    <input
                      type="text"
                      value={formData.cropxTelemetryId}
                      onChange={(e) => setFormData({ ...formData, cropxTelemetryId: e.target.value })}
                      placeholder="Enter telemetry ID"
                      style={{ fontSize: '16px', padding: '12px' }}
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
                      style={{ fontSize: '16px', padding: '12px' }}
                    />
                  </div>
                )}

                {/* Photo Field End */}
                <div className="form-group">
                  <label>Photo - Field End</label>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                    Stand at probe and take a picture toward the end of the field
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFileChange('photoFieldEnd', e.target.files?.[0] || null)}
                    style={{ fontSize: '16px' }}
                    disabled={compressing === 'photoFieldEnd'}
                  />
                  {compressing === 'photoFieldEnd' && (
                    <div style={{ marginTop: '8px', padding: '10px', background: 'var(--accent-amber-dim)', borderRadius: '8px', color: 'var(--accent-amber)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ animation: 'spin 1s linear infinite' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Compressing photo...</span>
                    </div>
                  )}
                  {formData.photoFieldEnd && !compressing && (
                    <div style={{ marginTop: '8px', padding: '10px', background: 'var(--accent-green-dim)', borderRadius: '8px', color: 'var(--accent-green)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    style={{ fontSize: '16px' }}
                    disabled={compressing === 'photoExtra'}
                  />
                  {compressing === 'photoExtra' && (
                    <div style={{ marginTop: '8px', padding: '10px', background: 'var(--accent-amber-dim)', borderRadius: '8px', color: 'var(--accent-amber)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ animation: 'spin 1s linear infinite' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Compressing photo...</span>
                    </div>
                  )}
                  {formData.photoExtra && !compressing && (
                    <div style={{ marginTop: '8px', padding: '10px', background: 'var(--accent-green-dim)', borderRadius: '8px', color: 'var(--accent-green)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    style={{ fontSize: '16px', padding: '12px' }}
                  />
                </div>
              </div>
            </div>

            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting || compressing !== null}
                style={{ flex: 1, justifyContent: 'center' }}
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
