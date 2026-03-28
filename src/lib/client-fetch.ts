import { Aircraft, CATEGORY_COLORS } from './opensky';

// Classify aircraft by callsign patterns (client-side version)
function classifyAircraft(callsign: string): Aircraft['category'] {
  const cs = callsign.toUpperCase().trim();
  
  const militaryPrefixes = ['RRR', 'RCH', 'JAKE', 'TOPCAT', 'HAWK', 'VIPER', 'DUKE', 'NATO', 'RAFR', 'ASCOT'];
  if (militaryPrefixes.some(p => cs.startsWith(p))) return 'military';
  
  const cargoPrefixes = ['FDX', 'UPS', 'GTI', 'CLX', 'BOX', 'ABW', 'MPH', 'CKS'];
  if (cargoPrefixes.some(p => cs.startsWith(p))) return 'cargo';
  
  const commercialPrefixes = [
    'BAW', 'EZY', 'RYR', 'AAL', 'UAL', 'DAL', 'SWA', 'AFR', 'DLH', 'KLM',
    'SAS', 'FIN', 'IBE', 'TAP', 'AZA', 'THY', 'UAE', 'QTR', 'ETH', 'SIA',
    'CPA', 'ANA', 'JAL', 'QFA', 'ANZ', 'ACA', 'WJA', 'VIR', 'EIN', 'BEE',
    'TOM', 'EXS', 'LOG', 'SHT', 'WZZ', 'VLG', 'NAX', 'ICE', 'LOT', 'CSA',
    'TAR', 'ROT', 'BEL', 'SWR', 'AUA', 'CFG', 'EWG', 'BER', 'JBU', 'NKS',
    'ASA', 'HAL', 'AAR', 'KAL', 'CCA', 'CES', 'CSN', 'HVN', 'GIA', 'MAS',
    'EVA', 'CAL', 'PAL', 'RAM', 'MSR', 'MEA', 'SVA', 'GFA', 'OMA', 'KAC',
  ];
  if (commercialPrefixes.some(p => cs.startsWith(p))) return 'commercial';
  
  if (/^[A-Z]{3}\d/.test(cs)) return 'commercial';
  if (/^N\d/.test(cs) || /^G-/.test(cs) || cs.length <= 4) return 'private';
  
  return 'unknown';
}

export async function fetchAircraftClient(): Promise<{ aircraft: Aircraft[]; time: number }> {
  // Fetch directly from OpenSky (supports CORS)
  const res = await fetch('https://opensky-network.org/api/states/all', {
    cache: 'no-store',
  });
  
  if (res.status === 429) {
    throw new Error('RATE_LIMITED');
  }
  
  if (!res.ok) throw new Error(`OpenSky API: ${res.status}`);
  
  const data = await res.json();
  
  if (!data.states) return { aircraft: [], time: Date.now() };
  
  const aircraft: Aircraft[] = data.states
    .filter((s: (string | number | boolean | null)[]) => s[5] != null && s[6] != null)
    .map((s: (string | number | boolean | null)[]) => {
      const callsign = ((s[1] as string) || '').trim();
      return {
        icao24: s[0] as string,
        callsign,
        originCountry: (s[2] as string) || '',
        lat: s[6] as number,
        lng: s[5] as number,
        altitude: ((s[7] as number) || 0),
        velocity: ((s[9] as number) || 0),
        heading: ((s[10] as number) || 0),
        verticalRate: ((s[11] as number) || 0),
        onGround: (s[8] as boolean) || false,
        category: classifyAircraft(callsign),
        lastUpdate: (s[4] as number) || data.time,
      };
    })
    .filter((a: Aircraft) => !a.onGround);
  
  return { aircraft, time: data.time * 1000 };
}
