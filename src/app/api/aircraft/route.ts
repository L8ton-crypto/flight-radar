import { NextResponse } from 'next/server';
import { fetchAircraft } from '@/lib/opensky';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const bounds = searchParams.has('lamin') ? {
      lamin: parseFloat(searchParams.get('lamin')!),
      lamax: parseFloat(searchParams.get('lamax')!),
      lomin: parseFloat(searchParams.get('lomin')!),
      lomax: parseFloat(searchParams.get('lomax')!),
    } : undefined;
    
    const aircraft = await fetchAircraft(bounds);
    
    return NextResponse.json({
      time: Date.now(),
      count: aircraft.length,
      aircraft,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=5',
      }
    });
  } catch (error) {
    console.error('Aircraft fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch aircraft data', details: String(error) },
      { status: 502 }
    );
  }
}
