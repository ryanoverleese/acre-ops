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

export async function fetchSoilData(lat: number, lng: number): Promise<{ muname: string | null; musym: string | null }> {
  try {
    const query = `
      SELECT TOP 1 mu.muname, mu.musym
      FROM mapunit mu
      INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${lng} ${lat})') AS res ON mu.mukey = res.mukey
    `;

    const response = await fetch('https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=${encodeURIComponent(query)}&format=JSON`,
    });

    const data = await response.json();

    if (data?.Table && data.Table.length > 0) {
      const row = data.Table[0];
      return { muname: row[0], musym: row[1] };
    }

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
