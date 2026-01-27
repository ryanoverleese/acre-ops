'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ProcessedField, OperationOption } from './page';

// Dynamically import the map component to avoid SSR issues
const FieldsMap = dynamic(() => import('@/components/FieldsMap'), {
  ssr: false,
  loading: () => <div className="fields-map" style={{ display: 'block' }}><div className="loading"><div className="loading-spinner"></div>Loading map...</div></div>,
});

interface FieldsClientProps {
  initialFields: ProcessedField[];
  operations: OperationOption[];
  statusCounts: {
    all: number;
    'needs-probe': number;
    pending: number;
    installed: number;
    repair: number;
  };
}

export default function FieldsClient({
  initialFields,
  operations,
  statusCounts,
}: FieldsClientProps) {
  const [currentFilter, setCurrentFilter] = useState<string>('all');
  const [currentOperation, setCurrentOperation] = useState<string>('all');
  const [mapVisible, setMapVisible] = useState(false);

  // Filter fields based on current selections
  const filteredFields = useMemo(() => {
    let filtered = initialFields;

    if (currentFilter !== 'all') {
      filtered = filtered.filter((f) => f.status === currentFilter);
    }

    if (currentOperation !== 'all') {
      filtered = filtered.filter((f) => f.operationId?.toString() === currentOperation);
    }

    return filtered;
  }, [initialFields, currentFilter, currentOperation]);

  // Prepare fields for map (convert to the format the map expects)
  const mapFields = useMemo(() => {
    return filteredFields.map((f) => ({
      id: f.id,
      name: f.name,
      operation: f.operation,
      acres: f.acres,
      crop: f.crop,
      probe: f.probe,
      status: f.status,
      lat: f.lat,
      lng: f.lng,
    }));
  }, [filteredFields]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { class: string; label: string }> = {
      installed: { class: 'installed', label: 'Installed' },
      pending: { class: 'pending', label: 'Pending' },
      repair: { class: 'repair', label: 'Repair' },
      'needs-probe': { class: 'needs-probe', label: 'Needs Probe' },
    };
    const config = statusMap[status] || { class: 'needs-probe', label: status };
    return (
      <span className={`status-badge ${config.class}`}>
        <span className="status-dot"></span>
        {config.label}
      </span>
    );
  };

  const getCropBadge = (crop: string) => {
    const cropClass = crop.toLowerCase() === 'corn' ? 'corn' : 'soybeans';
    return <span className={`crop-badge ${cropClass}`}>{crop}</span>;
  };

  return (
    <>
      {/* Status Tabs */}
      <div className="tabs" style={{ marginBottom: '16px' }}>
        <button
          className={`tab ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('all')}
        >
          All Fields ({statusCounts.all})
        </button>
        <button
          className={`tab ${currentFilter === 'needs-probe' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('needs-probe')}
        >
          Needs Probe ({statusCounts['needs-probe']})
        </button>
        <button
          className={`tab ${currentFilter === 'pending' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('pending')}
        >
          Ready to Install ({statusCounts.pending})
        </button>
        <button
          className={`tab ${currentFilter === 'installed' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('installed')}
        >
          Installed ({statusCounts.installed})
        </button>
      </div>

      {/* Fields Container */}
      <div className={`fields-container ${mapVisible ? 'map-visible' : ''}`}>
        <div className="fields-list">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">Fields — 2025 Season</h3>
              <div className="table-actions">
                <select
                  value={currentOperation}
                  onChange={(e) => setCurrentOperation(e.target.value)}
                >
                  <option value="all">All Operations</option>
                  {operations.map((op) => (
                    <option key={op.id} value={op.id.toString()}>
                      {op.name}
                    </option>
                  ))}
                </select>
                <button
                  className={`map-toggle ${mapVisible ? 'active' : ''}`}
                  onClick={() => setMapVisible(!mapVisible)}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                  Map View
                </button>
                <button className="btn btn-primary">
                  <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Field
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Operation</th>
                  <th>Acres</th>
                  <th>Crop</th>
                  <th>Probe</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredFields.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: 'center', color: 'var(--text-muted)' }}
                    >
                      No fields found. Add some in Baserow or adjust your filters.
                    </td>
                  </tr>
                ) : (
                  filteredFields.map((field) => (
                    <tr key={field.id} style={{ cursor: 'pointer' }}>
                      <td className="operation-name">{field.name}</td>
                      <td>
                        <span style={{ fontSize: '13px' }}>{field.operation}</span>
                      </td>
                      <td className="field-count">{field.acres}</td>
                      <td>{getCropBadge(field.crop)}</td>
                      <td
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '12px',
                          color: field.probe ? 'inherit' : 'var(--text-muted)',
                        }}
                      >
                        {field.probe || '—'}
                      </td>
                      <td>{getStatusBadge(field.status)}</td>
                      <td>
                        <button className="action-btn">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Map */}
        <FieldsMap fields={mapFields} visible={mapVisible} />
      </div>
    </>
  );
}
