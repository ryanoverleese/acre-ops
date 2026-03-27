/**
 * Shared server-side functions for fetching elevation and soil type data.
 * Used by API routes and server components.
 */

export async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const response = await fetch(
      `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Feet&wkid=4326`
    );

    if (!response.ok) {
      console.error('USGS API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (data && data.value !== undefined && data.value !== -1000000) {
      return Math.round(data.value);
    }

    return null;
  } catch (error) {
    console.error('Error fetching elevation:', error);
    return null;
  }
}

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('https');
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false,
        timeout: 15000,
      },
      (res: import('http').IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

export async function fetchSoilData(lat: number, lng: number): Promise<{ muname: string | null; musym: string | null }> {
  try {
    const query = `SELECT TOP 1 mu.muname, mu.musym FROM mapunit mu INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${lng} ${lat})') AS res ON mu.mukey = res.mukey`;
    const body = `query=${encodeURIComponent(query)}&format=JSON`;

    const raw = await httpsPost(
      'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest',
      body,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    const data = JSON.parse(raw);

    if (data?.Table && data.Table.length > 0) {
      const row = data.Table[0];
      return { muname: row[0] ?? null, musym: row[1] ?? null };
    }

    console.error('USDA SDA returned no Table data:', raw);
    return { muname: null, musym: null };
  } catch (error) {
    console.error('Error fetching soil data:', error);
    return { muname: null, musym: null };
  }
}

export async function fetchSoilType(lat: number, lng: number): Promise<string | null> {
  const { muname, musym } = await fetchSoilData(lat, lng);
  if (muname && musym) {
    return `${muname} (${musym})`;
  }
  return null;
}
