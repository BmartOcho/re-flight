// Shapes for the ADS-B lookup path (tail number + date -> real historical track).
export interface AircraftInfo {
  hex: string; // lowercase ICAO24
  registration: string;
  type: string; // ICAO type designator, e.g. "A320"
  typeLong?: string;
  operator?: string;
}

export interface TracePoint {
  t: number; // absolute epoch seconds
  lat: number;
  lon: number;
  altBaroFt: number | null; // null when on the ground marker
  ground: boolean;
  gsKt: number | null; // BROADCAST groundspeed
  vrateFpm: number | null;
  altGeomFt: number | null; // geometric/GPS altitude
}

export interface RawTrace {
  hex: string;
  registration: string;
  type: string;
  timestamp: number; // epoch seconds; each row is timestamp + dt
  points: TracePoint[];
}

/** A typed failure the API surface can translate into a helpful message. */
export class AdsbError extends Error {
  constructor(
    public code: 'not_found' | 'no_coverage' | 'blocked' | 'bad_input' | 'provider',
    message: string,
  ) {
    super(message);
    this.name = 'AdsbError';
  }
}
