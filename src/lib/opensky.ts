export interface Aircraft {
  icao24: string;
  callsign: string;
  originCountry: string;
  lat: number;
  lng: number;
  altitude: number; // metres
  velocity: number; // m/s
  heading: number; // degrees from north
  verticalRate: number; // m/s
  onGround: boolean;
  category: 'commercial' | 'cargo' | 'private' | 'military' | 'unknown';
  lastUpdate: number;
}

// OpenSky API returns an array of state vectors
// Docs: https://openskynetwork.github.io/opensky-api/rest.html
interface OpenSkyResponse {
  time: number;
  states: (string | number | boolean | null)[][] | null;
}

// Classify aircraft by callsign patterns
function classifyAircraft(callsign: string, originCountry: string): Aircraft['category'] {
  const cs = callsign.toUpperCase().trim();
  
  // Military callsigns/patterns
  const militaryPrefixes = ['RRR', 'RCH', 'JAKE', 'TOPCAT', 'HAWK', 'VIPER', 'DUKE', 'NATO', 'RAFR', 'ASCOT'];
  if (militaryPrefixes.some(p => cs.startsWith(p))) return 'military';
  
  // Cargo airlines
  const cargoPrefixes = ['FDX', 'UPS', 'GTI', 'CLX', 'BOX', 'ABW', 'MPH', 'CKS'];
  if (cargoPrefixes.some(p => cs.startsWith(p))) return 'cargo';
  
  // Major commercial airline ICAO prefixes
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
  
  // If callsign is 3 letters + numbers, likely commercial
  if (/^[A-Z]{3}\d/.test(cs)) return 'commercial';
  
  // Private/general aviation - typically N-numbers or short callsigns
  if (/^N\d/.test(cs) || /^G-/.test(cs) || cs.length <= 4) return 'private';
  
  return 'unknown';
}

export async function fetchAircraft(bounds?: {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}): Promise<Aircraft[]> {
  let url = 'https://opensky-network.org/api/states/all';
  
  if (bounds) {
    url += `?lamin=${bounds.lamin}&lamax=${bounds.lamax}&lomin=${bounds.lomin}&lomax=${bounds.lomax}`;
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'FlightRadar/1.0',
    },
    signal: controller.signal,
    cache: 'no-store',
  });
  
  clearTimeout(timeout);
  
  if (!res.ok) {
    throw new Error(`OpenSky API error: ${res.status}`);
  }
  
  const data: OpenSkyResponse = await res.json();
  
  if (!data.states) return [];
  
  return data.states
    .filter(s => s[5] != null && s[6] != null) // must have position
    .map(s => {
      const callsign = ((s[1] as string) || '').trim();
      const originCountry = (s[2] as string) || '';
      return {
        icao24: s[0] as string,
        callsign,
        originCountry,
        lat: s[6] as number,
        lng: s[5] as number,
        altitude: ((s[7] as number) || 0), // geo altitude in metres
        velocity: ((s[9] as number) || 0),
        heading: ((s[10] as number) || 0),
        verticalRate: ((s[11] as number) || 0),
        onGround: (s[8] as boolean) || false,
        category: classifyAircraft(callsign, originCountry),
        lastUpdate: (s[4] as number) || data.time,
      };
    })
    .filter(a => !a.onGround); // only show airborne aircraft
}

// Convert lat/lng/alt to 3D position on globe
export function latLngAltToVector3(
  lat: number,
  lng: number,
  altKm: number,
  globeRadius: number
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const r = globeRadius + (altKm / 6371) * globeRadius * 0.5; // exaggerate altitude for visibility
  
  const x = -(r * Math.sin(phi) * Math.cos(theta));
  const y = r * Math.cos(phi);
  const z = r * Math.sin(phi) * Math.sin(theta);
  
  return [x, y, z];
}

// Parse raw OpenSky response (for client-side fallback)
export function classifyAndParse(data: { time: number; states: (string | number | boolean | null)[][] | null }): Aircraft[] {
  if (!data.states) return [];
  
  return data.states
    .filter(s => s[5] != null && s[6] != null)
    .map(s => {
      const callsign = ((s[1] as string) || '').trim();
      const originCountry = (s[2] as string) || '';
      return {
        icao24: s[0] as string,
        callsign,
        originCountry,
        lat: s[6] as number,
        lng: s[5] as number,
        altitude: ((s[7] as number) || 0),
        velocity: ((s[9] as number) || 0),
        heading: ((s[10] as number) || 0),
        verticalRate: ((s[11] as number) || 0),
        onGround: (s[8] as boolean) || false,
        category: classifyAircraft(callsign, originCountry),
        lastUpdate: (s[4] as number) || data.time,
      };
    })
    .filter(a => !a.onGround);
}

export const CATEGORY_COLORS: Record<Aircraft['category'], string> = {
  commercial: '#4fc3f7',
  cargo: '#ffd54f',
  private: '#66bb6a',
  military: '#ff4444',
  unknown: '#9e9e9e',
};
