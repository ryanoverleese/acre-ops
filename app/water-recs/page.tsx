import { getWaterRecs, getFieldSeasons, getFields, getBillingEntities, getOperations } from '@/lib/baserow';

interface ProcessedWaterRec {
  id: number;
  fieldName: string;
  operation: string;
  crop: string;
  date: string;
  recommendation: string;
  suggestedWaterDay: string;
}

async function getWaterRecsData(): Promise<ProcessedWaterRec[]> {
  try {
    const [waterRecs, fieldSeasons, fields, billingEntities, operations] = await Promise.all([
      getWaterRecs(),
      getFieldSeasons(),
      getFields(),
      getBillingEntities(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
      }
    });

    return waterRecs.map((rec) => {
      const fsLink = rec.field_season?.[0];
      const fieldSeason = fsLink ? fieldSeasonMap.get(fsLink.id) : null;
      const fieldLink = fieldSeason?.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;

      let operationName = 'Unknown';
      if (field?.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          operationName = operationMap.get(opId) || 'Unknown';
        }
      }

      return {
        id: rec.id,
        fieldName: field?.name || fsLink?.value || 'Unknown Field',
        operation: operationName,
        crop: fieldSeason?.crop?.value || 'Unknown',
        date: rec.date || '',
        recommendation: rec.recommendation || '',
        suggestedWaterDay: rec.suggested_water_day?.value || '',
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('Error fetching water recs data:', error);
    return [];
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default async function WaterRecsPage() {
  const waterRecs = await getWaterRecsData();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Water Recommendations</h2>
          <span className="season-badge">2025 Season</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search fields..." />
          </div>
          <button className="btn btn-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Recommendation
          </button>
        </div>
      </header>

      <div className="content">
        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">All Recommendations ({waterRecs.length})</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Field</th>
                <th>Operation</th>
                <th>Crop</th>
                <th>Recommendation</th>
                <th>Suggested Water Day</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {waterRecs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No water recommendations found.
                  </td>
                </tr>
              ) : (
                waterRecs.map((rec) => (
                  <tr key={rec.id}>
                    <td style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{formatDate(rec.date)}</td>
                    <td className="operation-name">{rec.fieldName}</td>
                    <td style={{ fontSize: '13px' }}>{rec.operation}</td>
                    <td>
                      <span className={`crop-badge ${rec.crop.toLowerCase()}`}>{rec.crop}</span>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.4 }}>
                        {rec.recommendation || '—'}
                      </div>
                    </td>
                    <td>
                      {rec.suggestedWaterDay ? (
                        <span className="status-badge in-stock">
                          {rec.suggestedWaterDay}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <button className="action-btn">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
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
    </>
  );
}
