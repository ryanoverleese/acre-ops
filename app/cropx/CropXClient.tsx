'use client';

import { useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import type { CropXOperationRow } from './page';

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

  const rows = operations
    .map((op) => ({
      ...op,
      seasonData: op.seasons.find((s) => s.season === season),
    }))
    .filter((op) => op.seasonData);

  const totals = rows.reduce(
    (acc, op) => {
      const s = op.seasonData!;
      acc.fields += s.fields.length;
      acc.probes += s.fields.reduce((sum, f) => sum + f.probeCount, 0);
      acc.cropXService += s.cropXService;
      acc.onOrderV4 += s.onOrderV4;
      acc.onOrderTradeV4 += s.onOrderTradeV4;
      acc.onOrderApex += s.onOrderApex;
      return acc;
    },
    { fields: 0, probes: 0, cropXService: 0, onOrderV4: 0, onOrderTradeV4: 0, onOrderApex: 0 }
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">CropX Order Summary</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Season</label>
          <SearchableSelect
            value={season}
            onChange={setSeason}
            options={allSeasons.map((s) => ({ value: s, label: s }))}
            style={{ minWidth: 100 }}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', padding: '24px 0' }}>No data for {season}.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="cropx-summary-cards">
            <div className="cropx-card">
              <div className="cropx-card-value">{totals.fields}</div>
              <div className="cropx-card-label">Fields</div>
            </div>
            <div className="cropx-card">
              <div className="cropx-card-value">{totals.probes}</div>
              <div className="cropx-card-label">Total Probes</div>
            </div>
            <div className="cropx-card green">
              <div className="cropx-card-value">{totals.cropXService}</div>
              <div className="cropx-card-label">Renewals</div>
              <div className="cropx-card-sub">existing probes</div>
            </div>
            <div className="cropx-card blue">
              <div className="cropx-card-value">{totals.onOrderV4}</div>
              <div className="cropx-card-label">V4 New + Sub</div>
              <div className="cropx-card-sub">new probe + subscription</div>
            </div>
            <div className="cropx-card blue">
              <div className="cropx-card-value">{totals.onOrderTradeV4}</div>
              <div className="cropx-card-label">V4 Trade-In + Sub</div>
              <div className="cropx-card-sub">trade-in + subscription</div>
            </div>
            <div className="cropx-card amber">
              <div className="cropx-card-value">{totals.onOrderApex}</div>
              <div className="cropx-card-label">Apex Hardware Only</div>
              <div className="cropx-card-sub">sensor only</div>
            </div>
          </div>

          <div className="cropx-table-wrap">
            <table className="cropx-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Operation</th>
                  <th className="cropx-th-num">Fields</th>
                  <th className="cropx-th-num">Probes</th>
                  <th className="cropx-th-num">
                    Renewals
                    <div className="cropx-th-sub">existing probes</div>
                  </th>
                  <th className="cropx-th-num">
                    V4 New + Sub
                    <div className="cropx-th-sub blue">new probe + subscription</div>
                  </th>
                  <th className="cropx-th-num">
                    V4 Trade-In + Sub
                    <div className="cropx-th-sub blue">trade-in + subscription</div>
                  </th>
                  <th className="cropx-th-num">
                    Apex Hardware Only
                    <div className="cropx-th-sub amber">sensor only</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ id, name, seasonData }) => {
                  const s = seasonData!;
                  const isExpanded = expanded.has(id);
                  const fieldCount = s.fields.length;
                  const probeCount = s.fields.reduce((sum, f) => sum + f.probeCount, 0);
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
                        <td className="cropx-td-num"><span className="cropx-zero">{fieldCount}</span></td>
                        <td className="cropx-td-num"><span className="cropx-zero">{probeCount}</span></td>
                        <td className="cropx-td-num">
                          {s.cropXService > 0 ? <span className="cropx-badge green">{s.cropXService}</span> : <span className="cropx-zero">—</span>}
                        </td>
                        <td className="cropx-td-num">
                          {s.onOrderV4 > 0 ? <span className="cropx-badge blue">{s.onOrderV4}</span> : <span className="cropx-zero">—</span>}
                        </td>
                        <td className="cropx-td-num">
                          {s.onOrderTradeV4 > 0 ? <span className="cropx-badge blue">{s.onOrderTradeV4}</span> : <span className="cropx-zero">—</span>}
                        </td>
                        <td className="cropx-td-num">
                          {s.onOrderApex > 0 ? <span className="cropx-badge amber">{s.onOrderApex}</span> : <span className="cropx-zero">—</span>}
                        </td>
                      </tr>
                      {isExpanded && s.fields.map((f) => (
                        <tr key={f.fieldId} className="cropx-field-row">
                          <td style={{ paddingLeft: '36px' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{f.fieldName}</span>
                            {f.serviceType && <span className="cropx-service-tag">{f.serviceType}</span>}
                          </td>
                          <td className="cropx-td-num cropx-field-num">1</td>
                          <td className="cropx-td-num cropx-field-num">{f.probeCount}</td>
                          <td className="cropx-td-num cropx-field-num">
                            {f.cropXService > 0 ? f.cropXService : <span className="cropx-zero">—</span>}
                          </td>
                          <td className="cropx-td-num cropx-field-num">
                            {f.onOrderV4 > 0 ? f.onOrderV4 : <span className="cropx-zero">—</span>}
                          </td>
                          <td className="cropx-td-num cropx-field-num">
                            {f.onOrderTradeV4 > 0 ? f.onOrderTradeV4 : <span className="cropx-zero">—</span>}
                          </td>
                          <td className="cropx-td-num cropx-field-num">
                            {f.onOrderApex > 0 ? f.onOrderApex : <span className="cropx-zero">—</span>}
                          </td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
