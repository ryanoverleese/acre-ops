import { NextRequest, NextResponse } from 'next/server';

const HOLDREGE_LAT = 40.4403;
const HOLDREGE_LNG = -99.3698;
const DAY_MS = 86_400_000;

type OpenMeteoDaily = {
  time?: string[];
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  et0_fao_evapotranspiration?: Array<number | null>;
};

function dateInCentralTime(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setTime(value.getTime() + days * DAY_MS);
  return value.toISOString().slice(0, 10);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function cornGdu(rawMax: number | null | undefined, rawMin: number | null | undefined): number {
  if (typeof rawMax !== 'number' || typeof rawMin !== 'number') return 0;
  const cappedMax = Math.min(rawMax, 86);
  const flooredMin = Math.max(rawMin, 50);
  return Math.max(0, (cappedMax + flooredMin) / 2 - 50);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = Number(searchParams.get('lat') ?? HOLDREGE_LAT);
  const lng = Number(searchParams.get('lng') ?? HOLDREGE_LNG);
  const start = searchParams.get('start') ?? `${new Date().getUTCFullYear()}-04-22`;
  const asOfDate = searchParams.get('end') ?? dateInCentralTime();

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isDate(start) || !isDate(asOfDate)) {
    return NextResponse.json({ error: 'Invalid coordinates or date' }, { status: 400 });
  }

  // A report written today should use completed weather through yesterday, not
  // today's incomplete observations or a full-day forecast. Future-dated reports
  // are capped at the same point.
  const yesterday = shiftDate(dateInCentralTime(), -1);
  const requestedThrough = shiftDate(asOfDate, -1);
  const throughDate = requestedThrough < yesterday ? requestedThrough : yesterday;

  if (throughDate < start) {
    return NextResponse.json({
      gdu: 0,
      recentGdu: 0,
      et0Inches: 0,
      recentEt0Inches: 0,
      days: 0,
      throughDate,
      location: 'Holdrege, NE',
      latitude: lat,
      longitude: lng,
    });
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    start_date: start,
    end_date: throughDate,
    daily: 'temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration',
    temperature_unit: 'fahrenheit',
    timezone: 'America/Chicago',
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
  const today = dateInCentralTime();
  const forecastParams = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: 'temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit',
    timezone: 'America/Chicago',
    forecast_days: '16',
  });
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`;

  try {
    const [response, forecastResponse] = await Promise.all([
      fetch(url, { next: { revalidate: 21_600 } }),
      // A current/future report gets forecast heat beginning today. Historical
      // reports intentionally omit it rather than applying today's forecast to
      // an old recommendation date.
      asOfDate >= today
        ? fetch(forecastUrl, { next: { revalidate: 10_800 } })
        : Promise.resolve(null),
    ]);
    if (!response.ok) {
      return NextResponse.json({ error: `Weather service returned ${response.status}` }, { status: 502 });
    }

    const data = await response.json() as { daily?: OpenMeteoDaily; reason?: string };
    const daily = data.daily;
    if (!daily?.time || !daily.temperature_2m_max || !daily.temperature_2m_min) {
      return NextResponse.json({ error: data.reason || 'No daily weather data' }, { status: 502 });
    }

    let gdu = 0;
    let et0Mm = 0;
    const dailyGdu: number[] = [];
    const dailyEt0Mm: number[] = [];

    daily.time.forEach((_, index) => {
      const rawMax = daily.temperature_2m_max?.[index];
      const rawMin = daily.temperature_2m_min?.[index];
      const dayGdu = cornGdu(rawMax, rawMin);
      gdu += dayGdu;
      dailyGdu.push(dayGdu);

      const dayEt0 = daily.et0_fao_evapotranspiration?.[index];
      const validEt0 = typeof dayEt0 === 'number' ? Math.max(0, dayEt0) : 0;
      dailyEt0Mm.push(validEt0);
      et0Mm += validEt0;
    });

    const recentEt0Mm = dailyEt0Mm.slice(-7).reduce((sum, value) => sum + value, 0);
    const recentGdu = dailyGdu.slice(-7).reduce((sum, value) => sum + value, 0);
    let forecastDailyGdu: number[] = [];
    let forecastThroughDate: string | null = null;
    if (forecastResponse?.ok) {
      const forecastData = await forecastResponse.json() as { daily?: OpenMeteoDaily };
      const forecastDaily = forecastData.daily;
      if (forecastDaily?.time && forecastDaily.temperature_2m_max && forecastDaily.temperature_2m_min) {
        forecastDailyGdu = forecastDaily.time.map((_, index) => Number(cornGdu(
          forecastDaily.temperature_2m_max?.[index],
          forecastDaily.temperature_2m_min?.[index],
        ).toFixed(1)));
        forecastThroughDate = forecastDaily.time.at(-1) ?? null;
      }
    }

    return NextResponse.json({
      gdu: Math.round(gdu),
      recentGdu: Math.round(recentGdu),
      forecastDailyGdu,
      forecastThroughDate,
      et0Inches: Number((et0Mm / 25.4).toFixed(2)),
      recentEt0Inches: Number((recentEt0Mm / 25.4).toFixed(2)),
      days: daily.time.length,
      throughDate: daily.time.at(-1) ?? throughDate,
      location: 'Holdrege, NE',
      latitude: lat,
      longitude: lng,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
