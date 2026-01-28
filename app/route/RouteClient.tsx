'use client';

import { useState, useMemo } from 'react';

export interface FieldLocation {
  id: number;
  name: string;
  operation: string;
  acres: number;
  lat: number;
  lng: number;
  waterSource?: string;
  fuelSource?: string;
  notes?: string;
  // Irrigation details
  irrigationType?: string;
  rowDirection?: string;
  dripTubingDirection?: string;
  dripTubingSpacing?: number;
  dripEmitterSpacing?: number;
  dripZones?: number;
  dripGpm?: number;
  dripDepth?: number;
  // Location data
  elevation?: string | number;
  soilType?: string;
  placementNotes?: string;
}

interface FieldLocationsClientProps {
  fieldLocations: FieldLocation[];
}

export default function FieldLocationsClient({ fieldLocations }: FieldLocationsClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedField, setSelectedField] = useState<FieldLocation | null>(null);

  // Filter fields based on search query
  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return fieldLocations;
    const query = searchQuery.toLowerCase();
    return fieldLocations.filter(
      (field) =>
        field.name.toLowerCase().includes(query) ||
        field.operation.toLowerCase().includes(query)
    );
  }, [fieldLocations, searchQuery]);

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Field Locations</h2>
          <span className="season-badge">{fieldLocations.length} Fields</span>
        </div>
      </header>

      <div className="content">
        {/* Search Bar */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ position: 'relative' }}>
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '20px',
                height: '20px',
                color: 'var(--text-muted)',
              }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search fields or operations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                fontSize: '16px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
              {filteredFields.length} result{filteredFields.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Field List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredFields.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 48, height: 48, color: 'var(--text-muted)', marginBottom: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <h3 style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>No fields found</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                {searchQuery ? 'Try a different search term.' : 'No fields have been added yet.'}
              </p>
            </div>
          ) : (
            filteredFields.map((field) => (
              <div
                key={field.id}
                onClick={() => setSelectedField(field)}
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              >
                <div>
                  <div style={{ fontWeight: 500, marginBottom: '2px' }}>{field.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {field.operation} {field.acres ? `• ${field.acres} ac` : ''}
                  </div>
                </div>
                {field.lat !== 0 && field.lng !== 0 && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${field.lat},${field.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '8px 12px',
                      background: 'var(--accent-blue)',
                      color: 'white',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Navigate
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Field Detail Modal */}
      {selectedField && (
        <div className="detail-panel-overlay" onClick={() => setSelectedField(null)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>{selectedField.name}</h3>
              <button className="close-btn" onClick={() => setSelectedField(null)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="detail-section">
                <div className="detail-row">
                  <span className="detail-label">Operation</span>
                  <span className="detail-value">{selectedField.operation}</span>
                </div>
                {selectedField.acres > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Acres</span>
                    <span className="detail-value">{selectedField.acres}</span>
                  </div>
                )}
                {selectedField.lat !== 0 && selectedField.lng !== 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Coordinates</span>
                    <span className="detail-value">
                      <a
                        href={`https://www.google.com/maps?q=${selectedField.lat},${selectedField.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent-blue)' }}
                      >
                        {Number(selectedField.lat).toFixed(5)}, {Number(selectedField.lng).toFixed(5)}
                      </a>
                    </span>
                  </div>
                )}
                {selectedField.waterSource && (
                  <div className="detail-row">
                    <span className="detail-label">Water Source</span>
                    <span className="detail-value">{selectedField.waterSource}</span>
                  </div>
                )}
                {selectedField.fuelSource && (
                  <div className="detail-row">
                    <span className="detail-label">Fuel Source</span>
                    <span className="detail-value">{selectedField.fuelSource}</span>
                  </div>
                )}
                {selectedField.notes && (
                  <div className="detail-row">
                    <span className="detail-label">Notes</span>
                    <span className="detail-value">{selectedField.notes}</span>
                  </div>
                )}

                {/* Irrigation Details */}
                {(selectedField.irrigationType || selectedField.rowDirection) && (
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                    <div className="detail-row" style={{ marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Irrigation</span>
                    </div>
                    {selectedField.irrigationType && (
                      <div className="detail-row">
                        <span className="detail-label">Type</span>
                        <span className="detail-value">{selectedField.irrigationType}</span>
                      </div>
                    )}
                    {selectedField.rowDirection && (
                      <div className="detail-row">
                        <span className="detail-label">Row Direction</span>
                        <span className="detail-value">{selectedField.rowDirection}</span>
                      </div>
                    )}
                    {selectedField.irrigationType === 'Drip' && (
                      <>
                        {selectedField.dripTubingDirection && (
                          <div className="detail-row">
                            <span className="detail-label">Tubing Direction</span>
                            <span className="detail-value">{selectedField.dripTubingDirection}</span>
                          </div>
                        )}
                        {selectedField.dripTubingSpacing && (
                          <div className="detail-row">
                            <span className="detail-label">Tubing Spacing</span>
                            <span className="detail-value">{selectedField.dripTubingSpacing}"</span>
                          </div>
                        )}
                        {selectedField.dripEmitterSpacing && (
                          <div className="detail-row">
                            <span className="detail-label">Emitter Spacing</span>
                            <span className="detail-value">{selectedField.dripEmitterSpacing}"</span>
                          </div>
                        )}
                        {selectedField.dripZones && (
                          <div className="detail-row">
                            <span className="detail-label">Zones</span>
                            <span className="detail-value">{selectedField.dripZones}</span>
                          </div>
                        )}
                        {selectedField.dripGpm && (
                          <div className="detail-row">
                            <span className="detail-label">GPM</span>
                            <span className="detail-value">{selectedField.dripGpm}</span>
                          </div>
                        )}
                        {selectedField.dripDepth && (
                          <div className="detail-row">
                            <span className="detail-label">Depth</span>
                            <span className="detail-value">{selectedField.dripDepth}"</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Location Details */}
                {(selectedField.elevation || selectedField.soilType || selectedField.placementNotes) && (
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                    <div className="detail-row" style={{ marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Location Details</span>
                    </div>
                    {selectedField.elevation && (
                      <div className="detail-row">
                        <span className="detail-label">Elevation</span>
                        <span className="detail-value">{selectedField.elevation} ft</span>
                      </div>
                    )}
                    {selectedField.soilType && (
                      <div className="detail-row">
                        <span className="detail-label">Soil Type</span>
                        <span className="detail-value">{selectedField.soilType}</span>
                      </div>
                    )}
                    {selectedField.placementNotes && (
                      <div className="detail-row">
                        <span className="detail-label">Placement Notes</span>
                        <span className="detail-value">{selectedField.placementNotes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedField(null)}>
                Close
              </button>
              {selectedField.lat !== 0 && selectedField.lng !== 0 && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedField.lat},${selectedField.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
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
        </div>
      )}
    </>
  );
}
