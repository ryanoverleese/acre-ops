'use client';

import { useState } from 'react';
import type { CropXOperationRow, CropXSeasonData } from './page';

interface Props {
  operations: CropXOperationRow[];
  allSeasons: string[];
}

export default function CropXClient({ operations, allSeasons }: Props) {
  const [season, setSeason] = useState(allSeasons[0] ?? '');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter operations to selected season
  const rows = operations
    .map((op) => ({
      ...op,
      seasonData: op.seasons.find((s) => s.season === season),
    }))
    .filter((op) => op.seasonData);

  // Totals
  const totals = rows.reduce(
    (acc, op) => {
      const s = op.seasonData!;
      acc.cropXService += s.cropXService;
      acc.onOrder += s.onOrder;
      acc.onOrderTrade += s.onOrderTrade;
      return acc;
    },
    { cropXService: 0, onOrder: 0, onOrderTrade: 0 }
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">CropX Order Summary</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Season</label>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="filter-select"
          >
            {allSeasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', padding: '24px 0' }}>No data for {season}.</p>
      ) : (
        <div className="cropx-table-wrap">
          <table className="cropx-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Operation</th>
                <th className="cropx-th-num">CropX Annual Service</th>
                <th className="cropx-th-num">On Order</th>
                <th className="cropx-th-num">On Order - Trade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, name, seasonData }) => {
                const s = seasonData!;
                const isExpanded = expanded.has(id);
                return (
                  <>
                    <tr
                      key={id}
                      className="cropx-op-row"
                      onClick={() => toggleExpand(id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className="cropx-expand-icon">{isExpanded ? '▾' : '▸'}</span>
                        {name}
                      </td>
                      <td className="cropx-td-num">
                        {s.cropXService > 0 ? <span className="cropx-badge green">{s.cropXService}</span> : <span className="cropx-zero">—</span>}
                      </td>
                      <td className="cropx-td-num">
                        {s.onOrder > 0 ? <span className="cropx-badge blue">{s.onOrder}</span> : <span className="cropx-zero">—</span>}
                      </td>
                      <td className="cropx-td-num">
                        {s.onOrderTrade > 0 ? <span className="cropx-badge amber">{s.onOrderTrade}</span> : <span className="cropx-zero">—</span>}
                      </td>
                    </tr>
                    {isExpanded && s.fields.map((f) => (
                      <tr key={f.fieldId} className="cropx-field-row">
                        <td style={{ paddingLeft: '36px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{f.fieldName}</span>
                          {f.serviceType && (
                            <span className="cropx-service-tag">{f.serviceType}</span>
                          )}
                        </td>
                        <td className="cropx-td-num cropx-field-num">
                          {f.cropXService > 0 ? f.cropXService : <span className="cropx-zero">—</span>}
                        </td>
                        <td className="cropx-td-num cropx-field-num">
                          {f.onOrder > 0 ? f.onOrder : <span className="cropx-zero">—</span>}
                        </td>
                        <td className="cropx-td-num cropx-field-num">
                          {f.onOrderTrade > 0 ? f.onOrderTrade : <span className="cropx-zero">—</span>}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="cropx-total-row">
                <td><strong>Total — {season}</strong></td>
                <td className="cropx-td-num"><strong>{totals.cropXService || '—'}</strong></td>
                <td className="cropx-td-num"><strong>{totals.onOrder || '—'}</strong></td>
                <td className="cropx-td-num"><strong>{totals.onOrderTrade || '—'}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
