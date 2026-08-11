// The aircraft type registry: ICAO type designator -> the geometric parameters
// the parametric builder (parametric.ts) needs to construct a recognizable,
// correctly-proportioned model. Dimensions (wingspan/length, metres) are
// published manufacturer figures. This is what lets a tail-number lookup render
// the silhouette of what actually flew instead of one of three stand-ins.
//
// The shape vocabulary is deliberately coarse — wing position, sweep, engine
// count/type/placement, tail kind — because at replay camera distances those
// are exactly the cues that make a type readable. The livery stays stylised
// and the UI discloses that.

export type WingPosition = 'low' | 'high' | 'mid';
export type TailKind = 'conventional' | 't' | 'cruciform' | 'v';
export type EngineMount = 'nose' | 'wing' | 'aft' | 'over-wing';
export type EngineType = 'piston' | 'turboprop' | 'jet';
export type GearKind = 'tricycle' | 'taildragger' | 'none'; // none = retracted in flight
export type WingletKind = 'none' | 'winglet' | 'sharklet' | 'split' | 'raked';

export interface AircraftSpec {
  /** Human-readable type name, e.g. "Boeing 737-800". */
  name: string;
  /** Wingspan (fixed-wing) or main-rotor diameter (rotorcraft), metres. */
  wingspanM: number;
  lengthM: number;
  kind: 'fixed' | 'rotor';
  wingPos: WingPosition;
  /** Leading-edge sweep, degrees. */
  sweepDeg: number;
  dihedralDeg: number;
  /** Tip chord / root chord. */
  taper: number;
  winglet: WingletKind;
  /** High-wing lift struts (C172, Twin Otter). */
  struts: boolean;
  engineType: EngineType;
  /** 1, 2, 3 or 4. Threes: wing-mounted -> #3 in the fin root (DC-10/MD-11); aft-mounted -> centre S-duct (727, Falcon 900). */
  engineCount: number;
  engineMount: EngineMount;
  tail: TailKind;
  gear: GearKind;
  fusRadiusM: number;
  /** 747 upper-deck hump. */
  hump: boolean;
  /** True when this spec is a family/heuristic guess, not an exact designator match. */
  generic: boolean;
}

/* --------------------------------------------------------------- archetypes */

type Partial_ = Partial<Omit<AircraftSpec, 'name' | 'wingspanM' | 'lengthM'>>;

const BASE: Omit<AircraftSpec, 'name' | 'wingspanM' | 'lengthM' | 'fusRadiusM'> = {
  kind: 'fixed',
  wingPos: 'low',
  sweepDeg: 0,
  dihedralDeg: 5,
  taper: 0.45,
  winglet: 'none',
  struts: false,
  engineType: 'piston',
  engineCount: 1,
  engineMount: 'nose',
  tail: 'conventional',
  gear: 'tricycle',
  hump: false,
  generic: false,
};

// fusRadius defaults derive from span per archetype (see ratio below); rows can override.
const ARCH: Record<string, { p: Partial_; rRatio: number }> = {
  /** High-wing braced piston single (C172, C206). */
  'ga-high': { p: { wingPos: 'high', dihedralDeg: 1.5, taper: 0.7, struts: true }, rRatio: 1 / 17 },
  /** Low-wing piston single, fixed gear (Cherokee, SR22). */
  'ga-low': { p: { taper: 0.65, dihedralDeg: 6 }, rRatio: 1 / 17 },
  /** Low-wing piston single, retractable (Bonanza, Mooney). */
  'ga-low-r': { p: { taper: 0.6, dihedralDeg: 6, gear: 'none' }, rRatio: 1 / 17 },
  /** High-wing taildragger (Super Cub, Beaver). */
  'ga-tail': { p: { wingPos: 'high', dihedralDeg: 1, taper: 0.85, struts: true, gear: 'taildragger' }, rRatio: 1 / 16 },
  /** Low-wing piston twin, wing engines (Baron, Seneca). */
  'twin-piston': { p: { engineCount: 2, engineMount: 'wing', taper: 0.6, dihedralDeg: 6, gear: 'none' }, rRatio: 1 / 17 },
  /** Low-wing turboprop single (PC-12, TBM). */
  'tp-single-low': { p: { engineType: 'turboprop', taper: 0.5, dihedralDeg: 5, gear: 'none' }, rRatio: 1 / 20 },
  /** High-wing turboprop single, fixed gear (Caravan, Kodiak, Porter). */
  'tp-single-high': { p: { engineType: 'turboprop', wingPos: 'high', dihedralDeg: 2, taper: 0.7, struts: true }, rRatio: 1 / 18 },
  /** Low-wing turboprop twin (King Air; conventional or T per row). */
  'tp-twin-low': { p: { engineType: 'turboprop', engineCount: 2, engineMount: 'wing', taper: 0.5, dihedralDeg: 6, gear: 'none' }, rRatio: 1 / 22 },
  /** High-wing turboprop twin regional, T-tail (Dash 8, ATR). */
  'tp-regional': { p: { engineType: 'turboprop', engineCount: 2, engineMount: 'wing', wingPos: 'high', dihedralDeg: 2, taper: 0.5, tail: 't', gear: 'none' }, rRatio: 1 / 19 },
  /** High-wing braced utility twin, fixed gear (Twin Otter). */
  'tp-utility-twin': { p: { engineType: 'turboprop', engineCount: 2, engineMount: 'wing', wingPos: 'high', dihedralDeg: 2, taper: 0.85, struts: true }, rRatio: 1 / 18 },
  /** Aft-engine T-tail regional jet / bizjet (CRJ, ERJ, Learjet, Challenger). */
  'jet-aft-t': { p: { engineType: 'jet', engineCount: 2, engineMount: 'aft', sweepDeg: 24, dihedralDeg: 3, taper: 0.32, tail: 't', gear: 'none' }, rRatio: 1 / 17 },
  /** Aft-engine cruciform-tail bizjet (Citation X, Falcon 2000, Hawker). */
  'jet-aft-x': { p: { engineType: 'jet', engineCount: 2, engineMount: 'aft', sweepDeg: 26, dihedralDeg: 3, taper: 0.32, tail: 'cruciform', gear: 'none' }, rRatio: 1 / 18 },
  /** Wing-engine narrowbody airliner (737, A320, E-Jet). */
  'narrowbody': { p: { engineType: 'jet', engineCount: 2, engineMount: 'wing', sweepDeg: 27, dihedralDeg: 6, taper: 0.28, gear: 'none' }, rRatio: 1 / 17.5 },
  /** Wing-engine widebody twin (777, A330, 787). */
  'widebody': { p: { engineType: 'jet', engineCount: 2, engineMount: 'wing', sweepDeg: 32, dihedralDeg: 6, taper: 0.25, gear: 'none' }, rRatio: 1 / 20 },
  /** Four wing engines (A340, A380, 747 adds hump per row). */
  'quad': { p: { engineType: 'jet', engineCount: 4, engineMount: 'wing', sweepDeg: 34, dihedralDeg: 6, taper: 0.24, gear: 'none' }, rRatio: 1 / 20 },
  /** Helicopter: wingspanM is the main-rotor diameter. */
  'heli': { p: { kind: 'rotor', gear: 'none' }, rRatio: 1 / 8 },
};

/* ------------------------------------------------------------------- table */

// [name, wingspanM, lengthM, archetype, overrides?]
type Row = [string, number, number, keyof typeof ARCH, Partial_?];

const TYPES: Record<string, Row> = {
  /* ---- GA piston singles ---- */
  C150: ['Cessna 150', 10.11, 7.29, 'ga-high'],
  C152: ['Cessna 152', 10.11, 7.34, 'ga-high'],
  C162: ['Cessna 162 Skycatcher', 9.14, 6.86, 'ga-high'],
  C170: ['Cessna 170', 10.97, 7.61, 'ga-tail'],
  C172: ['Cessna 172 Skyhawk', 11.0, 8.28, 'ga-high'],
  C175: ['Cessna 175 Skylark', 11.02, 8.08, 'ga-high'],
  C177: ['Cessna 177 Cardinal', 10.82, 8.44, 'ga-high', { struts: false }],
  C180: ['Cessna 180 Skywagon', 10.92, 7.98, 'ga-tail'],
  C182: ['Cessna 182 Skylane', 11.02, 8.84, 'ga-high'],
  C185: ['Cessna 185 Skywagon', 10.92, 7.85, 'ga-tail'],
  C206: ['Cessna 206 Stationair', 10.97, 8.61, 'ga-high'],
  C210: ['Cessna 210 Centurion', 11.2, 8.59, 'ga-high', { struts: false, gear: 'none' }],
  P28A: ['Piper Cherokee / Archer', 10.8, 7.25, 'ga-low'],
  P28B: ['Piper Dakota', 10.8, 7.54, 'ga-low'],
  P28R: ['Piper Arrow', 10.8, 7.52, 'ga-low-r'],
  P28T: ['Piper Turbo Arrow', 10.8, 8.18, 'ga-low-r'],
  PA18: ['Piper Super Cub', 10.73, 6.88, 'ga-tail'],
  PA24: ['Piper Comanche', 10.97, 7.62, 'ga-low-r'],
  P32R: ['Piper Saratoga', 11.02, 8.44, 'ga-low-r'],
  PA32: ['Piper Cherokee Six', 9.99, 8.44, 'ga-low'],
  PA46: ['Piper Malibu / Mirage', 13.11, 8.81, 'ga-low-r'],
  BE33: ['Beechcraft Debonair', 10.21, 8.13, 'ga-low-r'],
  BE35: ['Beechcraft Bonanza V35', 10.21, 8.13, 'ga-low-r', { tail: 'v' }],
  BE36: ['Beechcraft Bonanza 36', 10.21, 8.38, 'ga-low-r'],
  BE23: ['Beechcraft Musketeer', 9.98, 7.85, 'ga-low'],
  SR20: ['Cirrus SR20', 11.68, 7.92, 'ga-low'],
  SR22: ['Cirrus SR22', 11.68, 7.92, 'ga-low'],
  S22T: ['Cirrus SR22T', 11.68, 7.92, 'ga-low'],
  DA40: ['Diamond DA40 Star', 11.94, 8.06, 'ga-low', { taper: 0.45 }],
  DV20: ['Diamond DV20 Katana', 10.78, 7.16, 'ga-low', { taper: 0.45 }],
  M20P: ['Mooney M20', 11.0, 8.15, 'ga-low-r'],
  M20T: ['Mooney M20 Turbo', 11.0, 8.15, 'ga-low-r'],
  AA5: ['Grumman Traveler', 9.6, 6.71, 'ga-low'],
  BL8: ['Bellanca Citabria', 10.19, 6.92, 'ga-tail'],
  CH7A: ['Champion Citabria', 10.19, 6.92, 'ga-tail'],
  DHC2: ['DHC-2 Beaver', 14.63, 9.22, 'ga-tail'],
  HUSK: ['Aviat Husky', 10.82, 6.88, 'ga-tail'],
  RV6: ["Van's RV-6", 7.01, 6.15, 'ga-low', { gear: 'taildragger' }],
  RV7: ["Van's RV-7", 7.62, 6.25, 'ga-low', { gear: 'taildragger' }],
  RV8: ["Van's RV-8", 7.32, 6.4, 'ga-low', { gear: 'taildragger' }],
  RV10: ["Van's RV-10", 9.68, 7.47, 'ga-low'],
  RV12: ["Van's RV-12", 8.13, 6.05, 'ga-low'],

  /* ---- Piston twins ---- */
  BE58: ['Beechcraft Baron 58', 11.53, 9.09, 'twin-piston'],
  BE55: ['Beechcraft Baron 55', 11.53, 8.53, 'twin-piston'],
  BE76: ['Beechcraft Duchess', 11.58, 8.86, 'twin-piston', { tail: 't' }],
  PA34: ['Piper Seneca', 11.85, 8.72, 'twin-piston'],
  PA44: ['Piper Seminole', 11.77, 8.41, 'twin-piston', { tail: 't' }],
  PA31: ['Piper Navajo', 12.4, 9.94, 'twin-piston'],
  PAY2: ['Piper Cheyenne II', 13.01, 10.57, 'tp-twin-low'],
  C310: ['Cessna 310', 11.25, 9.74, 'twin-piston'],
  C340: ['Cessna 340', 11.62, 10.46, 'twin-piston'],
  C402: ['Cessna 402', 13.45, 11.09, 'twin-piston'],
  C414: ['Cessna 414 Chancellor', 13.45, 11.09, 'twin-piston'],
  C421: ['Cessna 421 Golden Eagle', 12.53, 11.09, 'twin-piston'],
  DA42: ['Diamond DA42 Twin Star', 13.55, 8.56, 'twin-piston', { taper: 0.4 }],
  DA62: ['Diamond DA62', 14.55, 9.19, 'twin-piston', { taper: 0.4 }],

  /* ---- Turboprop singles ---- */
  PC12: ['Pilatus PC-12', 16.28, 14.4, 'tp-single-low'],
  TBM7: ['TBM 700', 12.68, 10.64, 'tp-single-low'],
  TBM8: ['TBM 850', 12.68, 10.64, 'tp-single-low'],
  TBM9: ['TBM 900/930/940', 12.83, 10.72, 'tp-single-low', { winglet: 'winglet' }],
  C208: ['Cessna 208 Caravan', 15.88, 11.46, 'tp-single-high'],
  C08T: ['Cessna 208B Grand Caravan', 15.88, 12.67, 'tp-single-high'],
  KODI: ['Daher Kodiak 100', 13.7, 10.36, 'tp-single-high'],
  PC6T: ['Pilatus PC-6 Porter', 15.87, 11.0, 'tp-single-high', { gear: 'taildragger' }],
  DHC3: ['DHC-3 Otter', 17.7, 12.75, 'tp-single-high', { gear: 'taildragger' }],
  EPIC: ['Epic E1000', 13.11, 10.9, 'tp-single-low'],

  /* ---- Turboprop twins & regionals ---- */
  BE9L: ['King Air 90', 15.32, 10.82, 'tp-twin-low'],
  BE20: ['King Air 200', 16.61, 13.34, 'tp-twin-low', { tail: 't' }],
  B350: ['King Air 350', 17.65, 14.22, 'tp-twin-low', { tail: 't', winglet: 'winglet' }],
  BE99: ['Beechcraft 99', 14.0, 13.58, 'tp-twin-low'],
  DHC6: ['DHC-6 Twin Otter', 19.8, 15.77, 'tp-utility-twin'],
  DH8A: ['Dash 8-100', 25.91, 22.25, 'tp-regional'],
  DH8B: ['Dash 8-200', 25.91, 22.25, 'tp-regional'],
  DH8C: ['Dash 8-300', 27.43, 25.68, 'tp-regional'],
  DH8D: ['Dash 8-400', 28.42, 32.83, 'tp-regional'],
  AT43: ['ATR 42-300', 24.57, 22.67, 'tp-regional'],
  AT45: ['ATR 42-500', 24.57, 22.67, 'tp-regional'],
  AT46: ['ATR 42-600', 24.57, 22.67, 'tp-regional'],
  AT72: ['ATR 72', 27.05, 27.17, 'tp-regional'],
  AT75: ['ATR 72-500', 27.05, 27.17, 'tp-regional'],
  AT76: ['ATR 72-600', 27.05, 27.17, 'tp-regional'],
  SF34: ['Saab 340', 21.44, 19.73, 'tp-twin-low'],
  SB20: ['Saab 2000', 24.76, 27.28, 'tp-twin-low'],
  E120: ['Embraer EMB-120 Brasilia', 19.78, 20.0, 'tp-twin-low', { tail: 't' }],
  SW4: ['Fairchild Metroliner', 14.1, 18.09, 'tp-twin-low'],
  JS31: ['Jetstream 31', 15.85, 14.37, 'tp-twin-low'],
  JS41: ['Jetstream 41', 18.29, 19.25, 'tp-twin-low'],
  F50: ['Fokker 50', 29.0, 25.25, 'tp-regional', { tail: 'conventional' }],
  C130: ['Lockheed C-130 Hercules', 40.41, 29.79, 'tp-regional', { engineCount: 4, tail: 'conventional', taper: 0.6 }],
  L188: ['Lockheed Electra', 30.18, 31.81, 'tp-twin-low', { engineCount: 4 }],

  /* ---- Business jets ---- */
  C500: ['Cessna Citation I', 14.35, 13.26, 'jet-aft-x'],
  C525: ['Cessna CitationJet / M2', 14.26, 12.98, 'jet-aft-t'],
  C25A: ['Cessna Citation CJ2', 15.19, 14.53, 'jet-aft-t'],
  C25B: ['Cessna Citation CJ3', 16.26, 15.59, 'jet-aft-t'],
  C25C: ['Cessna Citation CJ4', 15.49, 16.26, 'jet-aft-t'],
  C550: ['Cessna Citation II', 15.9, 14.39, 'jet-aft-x'],
  C560: ['Cessna Citation V / Encore', 16.31, 14.9, 'jet-aft-x'],
  C56X: ['Cessna Citation Excel', 17.17, 15.79, 'jet-aft-x'],
  C680: ['Cessna Citation Sovereign', 19.24, 19.35, 'jet-aft-x'],
  C68A: ['Cessna Citation Latitude', 22.05, 18.97, 'jet-aft-x'],
  C700: ['Cessna Citation Longitude', 21.09, 22.43, 'jet-aft-t'],
  C750: ['Cessna Citation X', 19.38, 22.05, 'jet-aft-x'],
  CL30: ['Bombardier Challenger 300', 19.46, 20.92, 'jet-aft-t', { winglet: 'winglet' }],
  CL35: ['Bombardier Challenger 350', 19.46, 20.92, 'jet-aft-t', { winglet: 'winglet' }],
  CL60: ['Bombardier Challenger 600', 19.61, 20.85, 'jet-aft-t', { winglet: 'winglet' }],
  GLEX: ['Bombardier Global Express', 28.65, 30.3, 'jet-aft-t', { winglet: 'winglet' }],
  GL5T: ['Bombardier Global 5000', 28.65, 29.5, 'jet-aft-t', { winglet: 'winglet' }],
  GL7T: ['Bombardier Global 7500', 31.7, 33.8, 'jet-aft-t', { winglet: 'sharklet' }],
  GLF3: ['Gulfstream III', 23.72, 25.32, 'jet-aft-t', { winglet: 'winglet' }],
  GLF4: ['Gulfstream IV', 23.72, 26.92, 'jet-aft-t', { winglet: 'winglet' }],
  GLF5: ['Gulfstream V', 28.5, 29.4, 'jet-aft-t', { winglet: 'winglet' }],
  GLF6: ['Gulfstream G650', 30.36, 30.41, 'jet-aft-t', { winglet: 'winglet' }],
  G280: ['Gulfstream G280', 19.21, 20.3, 'jet-aft-t', { winglet: 'winglet' }],
  LJ31: ['Learjet 31', 13.35, 14.83, 'jet-aft-t', { winglet: 'winglet' }],
  LJ35: ['Learjet 35', 12.04, 14.83, 'jet-aft-t'],
  LJ45: ['Learjet 45', 14.56, 17.68, 'jet-aft-t', { winglet: 'winglet' }],
  LJ60: ['Learjet 60', 13.35, 17.88, 'jet-aft-t', { winglet: 'winglet' }],
  LJ75: ['Learjet 75', 15.56, 17.68, 'jet-aft-t', { winglet: 'winglet' }],
  E50P: ['Embraer Phenom 100', 12.3, 12.82, 'jet-aft-t'],
  E55P: ['Embraer Phenom 300', 15.91, 15.64, 'jet-aft-t', { winglet: 'winglet' }],
  E545: ['Embraer Praetor 500', 21.5, 20.74, 'jet-aft-t', { winglet: 'winglet' }],
  E550: ['Embraer Praetor 600', 21.5, 20.74, 'jet-aft-t', { winglet: 'winglet' }],
  PC24: ['Pilatus PC-24', 17.0, 16.85, 'jet-aft-t'],
  HDJT: ['HondaJet', 12.12, 12.99, 'jet-aft-t', { engineMount: 'over-wing' }],
  BE40: ['Beechjet 400', 13.25, 14.75, 'jet-aft-t'],
  H25B: ['Hawker 800', 15.66, 15.6, 'jet-aft-x', { winglet: 'winglet' }],
  F2TH: ['Dassault Falcon 2000', 21.38, 20.22, 'jet-aft-x'],
  FA50: ['Dassault Falcon 50', 18.86, 18.5, 'jet-aft-x', { engineCount: 3 }],
  F900: ['Dassault Falcon 900', 19.33, 20.21, 'jet-aft-x', { engineCount: 3 }],
  FA7X: ['Dassault Falcon 7X', 26.21, 23.38, 'jet-aft-x', { engineCount: 3, winglet: 'winglet' }],
  FA8X: ['Dassault Falcon 8X', 26.29, 24.46, 'jet-aft-x', { engineCount: 3, winglet: 'winglet' }],
  SF50: ['Cirrus Vision Jet', 11.79, 9.42, 'jet-aft-t', { engineCount: 1, engineMount: 'over-wing', tail: 'v' }],
  EA50: ['Eclipse 500', 11.4, 10.11, 'jet-aft-t'],

  /* ---- Regional jets ---- */
  CRJ1: ['Bombardier CRJ100', 21.21, 26.77, 'jet-aft-t', { winglet: 'winglet' }],
  CRJ2: ['Bombardier CRJ200', 21.21, 26.77, 'jet-aft-t', { winglet: 'winglet' }],
  CRJ7: ['Bombardier CRJ700', 23.24, 32.3, 'jet-aft-t', { winglet: 'winglet' }],
  CRJ9: ['Bombardier CRJ900', 24.85, 36.4, 'jet-aft-t', { winglet: 'winglet' }],
  CRJX: ['Bombardier CRJ1000', 26.18, 39.1, 'jet-aft-t', { winglet: 'winglet' }],
  E135: ['Embraer ERJ-135', 20.04, 26.33, 'jet-aft-t', { winglet: 'winglet' }],
  E145: ['Embraer ERJ-145', 20.04, 29.87, 'jet-aft-t', { winglet: 'winglet' }],
  E170: ['Embraer E170', 26.0, 29.9, 'narrowbody', { winglet: 'winglet' }],
  E75S: ['Embraer E175', 26.0, 31.68, 'narrowbody', { winglet: 'winglet' }],
  E75L: ['Embraer E175', 28.65, 31.68, 'narrowbody', { winglet: 'split' }],
  E190: ['Embraer E190', 28.72, 36.24, 'narrowbody', { winglet: 'winglet' }],
  E195: ['Embraer E195', 28.72, 38.65, 'narrowbody', { winglet: 'winglet' }],
  E290: ['Embraer E190-E2', 33.72, 36.24, 'narrowbody', { winglet: 'raked' }],
  E295: ['Embraer E195-E2', 35.12, 41.5, 'narrowbody', { winglet: 'raked' }],
  B712: ['Boeing 717', 28.45, 37.8, 'jet-aft-t'],
  F70: ['Fokker 70', 28.08, 30.91, 'jet-aft-t'],
  F100: ['Fokker 100', 28.08, 35.53, 'jet-aft-t'],
  B461: ['BAe 146-100', 26.21, 26.2, 'narrowbody', { wingPos: 'high', engineCount: 4, tail: 't', sweepDeg: 15, dihedralDeg: -2 }],
  B462: ['BAe 146-200', 26.21, 28.6, 'narrowbody', { wingPos: 'high', engineCount: 4, tail: 't', sweepDeg: 15, dihedralDeg: -2 }],
  B463: ['BAe 146-300', 26.21, 30.99, 'narrowbody', { wingPos: 'high', engineCount: 4, tail: 't', sweepDeg: 15, dihedralDeg: -2 }],
  RJ85: ['Avro RJ85', 26.21, 28.6, 'narrowbody', { wingPos: 'high', engineCount: 4, tail: 't', sweepDeg: 15, dihedralDeg: -2 }],
  RJ1H: ['Avro RJ100', 26.21, 30.99, 'narrowbody', { wingPos: 'high', engineCount: 4, tail: 't', sweepDeg: 15, dihedralDeg: -2 }],

  /* ---- Narrowbody airliners ---- */
  A318: ['Airbus A318', 34.1, 31.44, 'narrowbody', { winglet: 'winglet' }],
  A319: ['Airbus A319', 34.1, 33.84, 'narrowbody', { winglet: 'winglet' }],
  A320: ['Airbus A320', 35.8, 37.57, 'narrowbody', { winglet: 'sharklet' }],
  A321: ['Airbus A321', 35.8, 44.51, 'narrowbody', { winglet: 'sharklet' }],
  A19N: ['Airbus A319neo', 35.8, 33.84, 'narrowbody', { winglet: 'sharklet' }],
  A20N: ['Airbus A320neo', 35.8, 37.57, 'narrowbody', { winglet: 'sharklet' }],
  A21N: ['Airbus A321neo', 35.8, 44.51, 'narrowbody', { winglet: 'sharklet' }],
  BCS1: ['Airbus A220-100', 35.1, 35.0, 'narrowbody', { winglet: 'raked' }],
  BCS3: ['Airbus A220-300', 35.1, 38.7, 'narrowbody', { winglet: 'raked' }],
  B722: ['Boeing 727-200', 32.92, 46.69, 'jet-aft-t', { engineCount: 3 }],
  B732: ['Boeing 737-200', 28.35, 30.53, 'narrowbody'],
  B733: ['Boeing 737-300', 28.88, 33.4, 'narrowbody'],
  B734: ['Boeing 737-400', 28.88, 36.4, 'narrowbody'],
  B735: ['Boeing 737-500', 28.88, 31.01, 'narrowbody'],
  B736: ['Boeing 737-600', 34.32, 31.24, 'narrowbody'],
  B737: ['Boeing 737-700', 34.32, 33.63, 'narrowbody', { winglet: 'winglet' }],
  B738: ['Boeing 737-800', 35.79, 39.47, 'narrowbody', { winglet: 'winglet' }],
  B739: ['Boeing 737-900', 35.79, 42.11, 'narrowbody', { winglet: 'winglet' }],
  B37M: ['Boeing 737 MAX 7', 35.92, 35.56, 'narrowbody', { winglet: 'split' }],
  B38M: ['Boeing 737 MAX 8', 35.92, 39.52, 'narrowbody', { winglet: 'split' }],
  B39M: ['Boeing 737 MAX 9', 35.92, 42.16, 'narrowbody', { winglet: 'split' }],
  B3XM: ['Boeing 737 MAX 10', 35.92, 43.8, 'narrowbody', { winglet: 'split' }],
  B752: ['Boeing 757-200', 38.05, 47.3, 'narrowbody', { winglet: 'winglet' }],
  B753: ['Boeing 757-300', 38.05, 54.41, 'narrowbody'],
  MD81: ['McDonnell Douglas MD-81', 32.8, 45.06, 'jet-aft-t'],
  MD82: ['McDonnell Douglas MD-82', 32.8, 45.06, 'jet-aft-t'],
  MD83: ['McDonnell Douglas MD-83', 32.8, 45.06, 'jet-aft-t'],
  MD87: ['McDonnell Douglas MD-87', 32.8, 39.75, 'jet-aft-t'],
  MD88: ['McDonnell Douglas MD-88', 32.8, 45.06, 'jet-aft-t'],
  MD90: ['McDonnell Douglas MD-90', 32.8, 46.51, 'jet-aft-t'],
  DC93: ['Douglas DC-9-30', 28.44, 36.37, 'jet-aft-t'],

  /* ---- Widebodies ---- */
  A306: ['Airbus A300-600', 44.84, 54.08, 'widebody', { winglet: 'winglet' }],
  A310: ['Airbus A310', 43.89, 46.66, 'widebody', { winglet: 'winglet' }],
  A332: ['Airbus A330-200', 60.3, 58.82, 'widebody', { winglet: 'winglet' }],
  A333: ['Airbus A330-300', 60.3, 63.69, 'widebody', { winglet: 'winglet' }],
  A338: ['Airbus A330-800neo', 64.0, 58.82, 'widebody', { winglet: 'sharklet' }],
  A339: ['Airbus A330-900neo', 64.0, 63.66, 'widebody', { winglet: 'sharklet' }],
  A342: ['Airbus A340-200', 60.3, 59.4, 'quad', { winglet: 'winglet' }],
  A343: ['Airbus A340-300', 60.3, 63.69, 'quad', { winglet: 'winglet' }],
  A345: ['Airbus A340-500', 63.45, 67.93, 'quad', { winglet: 'winglet' }],
  A346: ['Airbus A340-600', 63.45, 75.36, 'quad', { winglet: 'winglet' }],
  A359: ['Airbus A350-900', 64.75, 66.8, 'widebody', { winglet: 'sharklet' }],
  A35K: ['Airbus A350-1000', 64.75, 73.79, 'widebody', { winglet: 'sharklet' }],
  A388: ['Airbus A380-800', 79.75, 72.72, 'quad', { fusRadiusM: 3.6 }],
  B741: ['Boeing 747-100', 59.64, 70.66, 'quad', { hump: true }],
  B742: ['Boeing 747-200', 59.64, 70.66, 'quad', { hump: true }],
  B743: ['Boeing 747-300', 59.64, 70.66, 'quad', { hump: true }],
  B744: ['Boeing 747-400', 64.44, 70.67, 'quad', { hump: true, winglet: 'winglet' }],
  B748: ['Boeing 747-8', 68.4, 76.25, 'quad', { hump: true, winglet: 'raked' }],
  B762: ['Boeing 767-200', 47.57, 48.51, 'widebody'],
  B763: ['Boeing 767-300', 47.57, 54.94, 'widebody', { winglet: 'winglet' }],
  B764: ['Boeing 767-400', 51.92, 61.37, 'widebody', { winglet: 'raked' }],
  B772: ['Boeing 777-200', 60.93, 63.73, 'widebody'],
  B773: ['Boeing 777-300', 60.93, 73.86, 'widebody'],
  B77L: ['Boeing 777-200LR', 64.8, 63.73, 'widebody', { winglet: 'raked' }],
  B77W: ['Boeing 777-300ER', 64.8, 73.86, 'widebody', { winglet: 'raked' }],
  B788: ['Boeing 787-8', 60.12, 56.72, 'widebody', { winglet: 'raked' }],
  B789: ['Boeing 787-9', 60.12, 62.81, 'widebody', { winglet: 'raked' }],
  B78X: ['Boeing 787-10', 60.12, 68.28, 'widebody', { winglet: 'raked' }],
  MD11: ['McDonnell Douglas MD-11', 51.97, 61.62, 'widebody', { engineCount: 3, winglet: 'winglet' }],
  DC10: ['McDonnell Douglas DC-10', 50.4, 55.5, 'widebody', { engineCount: 3 }],

  /* ---- Rotorcraft (wingspanM = main-rotor diameter) ---- */
  R22: ['Robinson R22', 7.67, 8.76, 'heli'],
  R44: ['Robinson R44', 10.06, 11.66, 'heli'],
  R66: ['Robinson R66', 10.06, 11.66, 'heli'],
  B06: ['Bell 206 JetRanger', 10.16, 11.82, 'heli'],
  B407: ['Bell 407', 10.67, 12.7, 'heli'],
  B429: ['Bell 429', 10.97, 12.7, 'heli'],
  B212: ['Bell 212', 14.63, 17.46, 'heli'],
  B412: ['Bell 412', 14.02, 17.12, 'heli'],
  EC20: ['Airbus H120', 10.0, 11.52, 'heli'],
  EC30: ['Airbus H130', 10.69, 12.64, 'heli'],
  EC35: ['Airbus H135', 10.2, 12.16, 'heli'],
  EC45: ['Airbus H145', 10.8, 13.03, 'heli'],
  EC75: ['Airbus H175', 14.8, 17.17, 'heli'],
  AS50: ['Airbus AS350 Écureuil', 10.69, 12.94, 'heli'],
  AS55: ['Airbus AS355', 10.69, 12.94, 'heli'],
  A109: ['Leonardo AW109', 11.0, 13.04, 'heli'],
  A119: ['Leonardo AW119', 10.83, 13.01, 'heli'],
  A139: ['Leonardo AW139', 13.8, 16.66, 'heli'],
  S76: ['Sikorsky S-76', 13.41, 16.0, 'heli'],
  S92: ['Sikorsky S-92', 17.17, 20.88, 'heli'],
  H60: ['Sikorsky UH-60 Black Hawk', 16.36, 19.76, 'heli'],
  MD52: ['MD 520N', 8.33, 9.78, 'heli'],
  H500: ['Hughes/MD 500', 8.05, 9.4, 'heli'],
};

/* --------------------------------------------------- family fallback rules */

// Prefix -> stand-in designator, for variants the table doesn't list exactly.
const FAMILIES: [RegExp, string][] = [
  [/^B73/, 'B738'],
  [/^B74/, 'B744'],
  [/^B75/, 'B752'],
  [/^B76/, 'B763'],
  [/^B77/, 'B772'],
  [/^B78/, 'B789'],
  [/^B3.M/, 'B38M'],
  [/^A31/, 'A319'],
  [/^A32/, 'A320'],
  [/^A33/, 'A333'],
  [/^A34/, 'A343'],
  [/^A35/, 'A359'],
  [/^A38/, 'A388'],
  [/^BCS/, 'BCS3'],
  [/^CRJ/, 'CRJ9'],
  [/^E13|^E14/, 'E145'],
  [/^E17|^E7/, 'E75L'],
  [/^E19|^E29/, 'E190'],
  [/^MD8|^MD9|^DC9/, 'MD82'],
  [/^DH8/, 'DH8D'],
  [/^AT[47]/, 'AT76'],
  [/^C17[0-9]?$/, 'C172'],
  [/^C18/, 'C182'],
  [/^C2[01]/, 'C206'],
  [/^P28/, 'P28A'],
  [/^PA2/, 'PA24'],
  [/^PA3/, 'PA32'],
  [/^SR2|^S22/, 'SR22'],
  [/^BE3[356]/, 'BE36'],
  [/^BE5[58]/, 'BE58'],
  [/^BE(20|30)|^B[23]50/, 'BE20'],
  [/^BE9/, 'BE9L'],
  [/^TBM/, 'TBM9'],
  [/^PC1/, 'PC12'],
  [/^C25|^C5[026]/, 'C560'],
  [/^C6[87]/, 'C680'],
  [/^C7[05]/, 'C750'],
  [/^CL[36]/, 'CL60'],
  [/^GLF|^GL[0-9]/, 'GLF5'],
  [/^LJ/, 'LJ45'],
  [/^F(A)?[5789]0/, 'F900'],
  [/^F2TH/, 'F2TH'],
  [/^GA?5C|^G[1-6]5/, 'GLF5'],
  [/^EC[0-9]|^AS[35]5|^H1[23][05]/, 'EC35'],
  [/^R[246][246]/, 'R44'],
  [/^B4[01][0-9]|^B20[06]|^B21[02]/, 'B407'],
  [/^S[79][26]/, 'S76'],
  [/^AW|^A1[0-9]9/, 'A139'],
];

// Very last resort: guess the class from the designator's shape so an unknown
// type at least gets a plausible generic body instead of a specific wrong one.
const GENERIC: Record<string, Row> = {
  'light-single': ['Light single-engine aircraft', 11.0, 8.0, 'ga-high'],
  'light-twin': ['Light twin-engine aircraft', 12.0, 9.5, 'twin-piston'],
  bizjet: ['Business jet', 18.0, 18.0, 'jet-aft-t'],
  airliner: ['Twin-jet airliner', 34.3, 38.0, 'narrowbody'],
  heli: ['Helicopter', 11.0, 13.0, 'heli'],
};

function specFromRow(row: Row, generic: boolean): AircraftSpec {
  const [name, wingspanM, lengthM, arch, over] = row;
  const a = ARCH[arch];
  const merged = { ...BASE, ...a.p, ...(over ?? {}) } as Omit<AircraftSpec, 'name' | 'wingspanM' | 'lengthM' | 'fusRadiusM'> & { fusRadiusM?: number };
  const fusRadiusM = merged.fusRadiusM ?? wingspanM * a.rRatio;
  return { ...merged, name, wingspanM, lengthM, fusRadiusM, generic };
}

/**
 * Resolve an ICAO type designator (e.g. "B39M", "C172", "PC12") to build
 * parameters. Falls back exact -> family -> generic-by-class (using the
 * registry's long type name, when given, to pick the class); `generic` is
 * true when the result is a guess rather than an exact match, so callers can
 * disclose it.
 */
export function resolveSpec(icaoType: string, longName?: string): AircraftSpec {
  const t = (icaoType || '').trim().toUpperCase();
  if (TYPES[t]) return specFromRow(TYPES[t], false);
  for (const [re, target] of FAMILIES) {
    if (re.test(t) && TYPES[target]) {
      const row = TYPES[target];
      return specFromRow([`${row[0]} (family)`, row[1], row[2], row[3], row[4]], true);
    }
  }
  const long = (longName || '').toUpperCase();
  let cls: keyof typeof GENERIC = 'light-single';
  if (/HELI|COPTER|ROTOR/.test(long)) cls = 'heli';
  else if (/AIRBUS|BOEING|EMBRAER 1|E-?JET|REGIONAL JET/.test(long)) cls = 'airliner';
  else if (/JET|CITATION|FALCON|GULFSTREAM|LEARJET|CHALLENGER|GLOBAL/.test(long)) cls = 'bizjet';
  else if (/TWIN|BARON|SENECA|NAVAJO|KING AIR/.test(long)) cls = 'light-twin';
  return specFromRow(GENERIC[cls], true);
}

/** True if the designator resolves to an exact (non-guessed) entry. */
export function hasExactSpec(icaoType: string): boolean {
  return !!TYPES[(icaoType || '').trim().toUpperCase()];
}

/** Every exact designator in the registry (for the check script / hangar page). */
export const ALL_TYPE_DESIGNATORS = Object.keys(TYPES);
