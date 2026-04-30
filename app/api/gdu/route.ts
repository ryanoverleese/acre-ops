import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseFloat(searchParams.get('lat') ?? '40.8');
  const lng = parseFloat(searchParams.get('lng') ?? '-98.3');
  const start = searchParams.get('start') ?? '2026-04-22';
  const today = new Date().toISOString().slice(0, 10);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min&start_date=${start}&end_date=${today}&temperature_unit=fahrenheit&timezone=auto`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.daily?.temperature_2m_max) {
      return NextResponse.json({ error: 'No daily data', raw: data, url });
    }

    let gdu = 0;
    const days = data.daily.time.map((date: string, i: number) => {
      const tmax = Math.min(data.daily.temperature_2m_max[i] ?? 50, 86);
      const tmin = Math.max(data.daily.temperature_2m_min[i] ?? 50, 50);
      const dayGdu = Math.max(0, (tmax + tmin) / 2 - 50);
      gdu += dayGdu;
      return { date, tmax: data.daily.temperature_2m_max[i], tmin: data.daily.temperature_2m_min[i], dayGdu: Math.round(dayGdu) };
    });

    return NextResponse.json({ gdu: Math.round(gdu), days, url });
  } catch (e) {
    return NextResponse.json({ error: String(e), url });
  }
}
